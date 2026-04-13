"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  AppState,
  Dimensions,
  BackHandler,
  Animated,
  Easing,
  Vibration,
  PanResponder,
  Image,
  StatusBar
} from "react-native"
import MapView, { Polyline, Marker, PROVIDER_GOOGLE, AnimatedRegion } from "react-native-maps"
import * as Location from "expo-location"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import CustomModal from "../components/CustomModal"
import { FontAwesome } from "@expo/vector-icons"
import { Ionicons } from "@expo/vector-icons"
import {
  calculateDistance,
  formatDuration,
  formatDistance,
  formatPacePerKm,
  formatSpeedKmh,
  calculatePace,
  ensureNumeric,
} from "../utils/activityUtils"
import { db, auth } from "../firebaseConfig"
import { setDoc, serverTimestamp, doc, getDoc } from "firebase/firestore"
import { XPManager } from "../utils/xpManager"
import { generateRoute } from "../utils/routeGenerator"
import { PanGestureHandler, State } from "react-native-gesture-handler"
import { LinearGradient } from "expo-linear-gradient"
import { QuestProgressManager } from "../utils/QuestProgressManager"
import { KalmanFilter } from "../utils/KalmanFilter"

// --- IMPORT ICONS ---
import WalkingIcon from "../components/icons/walking.png"
import RunningIcon from "../components/icons/running.png"
import CyclingIcon from "../components/icons/cycling.png"
import JoggingIcon from "../components/icons/jogging.png"

const { width, height } = Dimensions.get("window")
const isAndroid = Platform.OS === "android"
const isSmallDevice = width < 375

const MINIMUM_DISTANCE_THRESHOLDS = {
  walking: 0.5,
  jogging: 1,
  running: 2,
  cycling: 4,
};

const PACE_WINDOW_SIZES = { walking: 5, jogging: 5, running: 5, cycling: 7 }

const MAP_STYLES = [
  { name: "Hybrid", style: [], mapType: "hybrid" },
  { name: "Standard", style: [], mapType: "standard" },
]

// --- HELPER: Bearing Calculation ---
const calculateBearing = (startLat, startLng, destLat, destLng) => {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const destLatRad = (destLat * Math.PI) / 180;
  const destLngRad = (destLng * Math.PI) / 180;

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  const brng = Math.atan2(y, x);
  const brngDeg = (brng * 180) / Math.PI;
  return (brngDeg + 360) % 360; // Normalize to 0-360
};

const MapScreen = ({ navigateToActivity, route, navigateToDashboard, params = {} }) => {
  console.log("MapScreen: Initialized with params:", params)

  const {
    activityType = "walking",
    activityColor = "#4361EE",
    targetDistance = "0",
    targetTime = "0",
    tracking: initialTracking = true,
    initialCoordinates = [],
    initialStats = { distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0, elevationGain: 0 },
    activeQuest = null,
    questProgress = 0,
    userHeight = 170,
  } = params

  const [activeChallenge, setActiveChallenge] = useState(null);

  useEffect(() => {
    if (route?.params?.challenge) {
      setActiveChallenge(route.params.challenge);
    }
  }, [route?.params]);

  // Core state variables
  const [coordinates, setCoordinates] = useState(initialCoordinates)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tracking, setTracking] = useState(initialTracking)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [stats, setStats] = useState(initialStats)
  const [watchId, setWatchId] = useState(null)
  const [gpsSignal, setGpsSignal] = useState("Unknown")
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false)
  const [distanceThreshold, setDistanceThreshold] = useState(MINIMUM_DISTANCE_THRESHOLDS[activityType] || 1.5)
  const [smoothedPace, setSmoothedPace] = useState(0)
  const [gpsIndicatorPosition, setGpsIndicatorPosition] = useState({
    x: width - 100,
    y: 16,
  })
  const [suggestedRoute, setSuggestedRoute] = useState(null)
  const [showSuggestedRoute, setShowSuggestedRoute] = useState(false)
  const [followingSuggestedRoute, setFollowingSuggestedRoute] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)

  // --- CAMERA & HEADING STATES ---
  const [heading, setHeading] = useState(0);
  const [mapRotationEnabled, setMapRotationEnabled] = useState(true); // Default to rotation enabled (Nav mode)
  const headingRef = useRef(0);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const isFollowingUserRef = useRef(true);

  const [modalContent, setModalContent] = useState({
    title: "",
    message: "",
    onConfirm: null,
    type: "info",
    icon: null,
    buttons: [],
  })

  const [isPaused, setIsPaused] = useState(false)
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [userStats, setUserStats] = useState({
    level: 1,
    totalXP: 0,
  })

  // Countdown timer state
  const [remainingSecs, setRemainingSecs] = useState(null);
  const countdownIntervalRef = useRef(null);
  const timerInitializedRef = useRef(false);

  const pan = useRef(new Animated.ValueXY({ x: width - 100, y: 16 })).current
  const recentPacesRef = useRef([])
  const paceWindowSizeRef = useRef(PACE_WINDOW_SIZES[activityType] || 5)

  // Animation refs
  const iconPulseAnim = useRef(new Animated.Value(1)).current
  const iconMoveAnim = useRef(new Animated.Value(0)).current
  const spinAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(1)).current
  const questPulseAnim = useRef(new Animated.Value(1)).current
  const saveDiscardFadeAnim = useRef(new Animated.Value(0)).current
  const saveDiscardSlideAnim = useRef(new Animated.Value(0)).current
  const satellitePulseAnim = useRef(new Animated.Value(1)).current

  const [currentMapStyleIndex, setCurrentMapStyleIndex] = useState(0)
  const [showMapStylePicker, setShowMapStylePicker] = useState(false)

  const { sessionStart: sessionStartParam } = params || {}
  const sessionStartRef = useRef(sessionStartParam || null)

  // Refs
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const lastUpdateTimeRef = useRef(Date.now())
  const lowAccuracyCountRef = useRef(0)
  const rawCoordinatesRef = useRef([])
  const locationWatchRef = useRef(null)
  const headingWatchRef = useRef(null)
  const lastCoordinateRef = useRef(null)
  const coordinatesRef = useRef([])
  const lastMovementTimeRef = useRef(Date.now()) // Track last movement for pace smoothing

  // --- SMOOTHING REFS ---
  const latKalmanRef = useRef(new KalmanFilter(3, 10))
  const lngKalmanRef = useRef(new KalmanFilter(3, 10))

  // Animated Marker for smoothness
  const animatedCoordinate = useRef(new AnimatedRegion({
    latitude: initialCoordinates[0]?.latitude || 37.78825,
    longitude: initialCoordinates[0]?.longitude || -122.4324,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  })).current

  const locationAccuracy =
    activityType === "running" || activityType === "jogging"
      ? Location.Accuracy.BestForNavigation
      : Location.Accuracy.High

  // --- UPDATED CONFIG WITH IMAGES ---
  const activityConfigs = {
    walking: { icon: WalkingIcon, color: "#4361EE", strokeColor: "#4361EE", darkColor: "#3651D4" },
    running: { icon: RunningIcon, color: "#EF476F", strokeColor: "#EF476F", darkColor: "#D43E63" },
    cycling: { icon: CyclingIcon, color: "#06D6A0", strokeColor: "#06D6A0", darkColor: "#05C090" },
    jogging: { icon: JoggingIcon, color: "rgb(255, 193, 7)", strokeColor: "rgb(255, 193, 7)", darkColor: "#E6BC5C" },
  }

  const currentActivity = activityConfigs[activityType] || activityConfigs.walking

  // --- CAMERA CONTROL FUNCTION ---
  const updateCamera = (location, headingValue) => {
    if (!mapRef.current || !isFollowingUserRef.current) return;

    const cameraConfig = {
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      // If rotation is enabled, use heading and pitch (3D view)
      // If disabled, 0 heading (North Up) and 0 pitch (Flat view)
      heading: mapRotationEnabled ? headingValue : 0,
      pitch: mapRotationEnabled ? 50 : 0,
      altitude: mapRotationEnabled ? 200 : 1000, // Zoom closer in navigation mode
      zoom: mapRotationEnabled ? 18 : 16,
    };

    mapRef.current.animateCamera(cameraConfig, { duration: 1000 });
  };

  const toggleMapRotation = () => {
    const newStatus = !mapRotationEnabled;
    setMapRotationEnabled(newStatus);

    // Immediately update camera to reflect preference
    if (currentLocation) {
      if (mapRef.current) {
        mapRef.current.animateCamera({
          center: currentLocation,
          heading: newStatus ? headingRef.current : 0,
          pitch: newStatus ? 50 : 0,
          zoom: newStatus ? 18 : 16
        }, { duration: 600 });
      }
    }
  };

  const recenterMap = () => {
    setIsFollowingUser(true);
    isFollowingUserRef.current = true;
    if (currentLocation) {
      updateCamera(currentLocation, headingRef.current);
    }
  };

  // --- HELPER: Handle Manual Drag ---
  const handleManualDrag = () => {
    if (isFollowingUserRef.current) {
      setIsFollowingUser(false);
      isFollowingUserRef.current = false;
    }
  };

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const loadUserStats = async () => {
    try {
      const user = auth.currentUser
      if (!user) return
      const userRef = doc(db, "users", user.uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const userData = userDoc.data()
        setUserStats({
          level: userData.level || 1,
          totalXP: userData.totalXP || 0,
        })
      }
    } catch (error) {
      console.error("MapScreen: Error loading user stats:", error)
    }
  }

  useEffect(() => {
    if (params.questId || (params.title && params.description && params.goal && params.unit)) {
      const questData = {
        id: params.questId || `quest_${Date.now()}`,
        title: params.title,
        description: params.description,
        goal: params.goal,
        unit: params.unit,
        progress: questProgress || params.progress || 0,
        status: params.status || "not_started",
        activityType: params.activityType,
        xpReward: params.xpReward || 50,
        difficulty: params.difficulty || "medium",
        category: params.category || "fitness",
        mode: params.mode,
        durationMinutes: params.durationMinutes,
        stakeXP: params.stakeXP,
      }

      setSelectedQuest(questData)

      if (questData.durationMinutes && questData.durationMinutes > 0 && !timerInitializedRef.current) {
        const initialSeconds = questData.durationMinutes * 60;
        setRemainingSecs(initialSeconds);
        timerInitializedRef.current = true;
      }
    } else if (activeQuest) {
      setSelectedQuest(activeQuest)

      if (activeQuest.durationMinutes && activeQuest.durationMinutes > 0 && !timerInitializedRef.current) {
        const initialSeconds = activeQuest.durationMinutes * 60;
        setRemainingSecs(initialSeconds);
        timerInitializedRef.current = true;
      }
    } else {
      setSelectedQuest(null)
    }
  }, [params, activeQuest])

  useEffect(() => {
    loadUserStats()
  }, [])

  useEffect(() => {
    if (selectedQuest) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(questPulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(questPulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start()
    }
  }, [selectedQuest, questPulseAnim])

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tracking && remainingSecs !== null && !countdownIntervalRef.current) {
      countdownIntervalRef.current = setInterval(() => {
        setRemainingSecs((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
            Vibration.vibrate(500);
            stopTracking();
            return 0;
          }
          if (prev <= 4 && prev > 1) {
            Vibration.vibrate(100);
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!tracking && countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, [tracking, remainingSecs]);

  const getDisplayQuestProgress = (quest) => {
    if (!quest) return 0
    const questStats = {
      ...stats,
      distance: stats.distance / 1000,
    }
    return QuestProgressManager.getProgressPercentage(quest, questStats, 0)
  }

  const getQuestStatus = (quest) => {
    if (!quest) return "not_started"
    const questStats = {
      ...stats,
      distance: stats.distance / 1000,
    }
    return QuestProgressManager.getQuestStatus(quest, questStats, 0)
  }

  const calculateMovingAveragePace = (newPace) => {
    if (isNaN(newPace) || newPace === 0 || !isFinite(newPace)) {
      if (recentPacesRef.current.length === 0) {
        return 0
      }
      const sum = recentPacesRef.current.reduce((acc, val) => acc + val, 0)
      return sum / recentPacesRef.current.length
    }

    recentPacesRef.current.push(newPace)
    if (recentPacesRef.current.length > paceWindowSizeRef.current) {
      recentPacesRef.current.shift()
    }

    const sum = recentPacesRef.current.reduce((acc, val) => acc + val, 0)
    return sum / recentPacesRef.current.length
  }

  useEffect(() => {
    setDistanceThreshold(MINIMUM_DISTANCE_THRESHOLDS[activityType] || 1.5)
    paceWindowSizeRef.current = PACE_WINDOW_SIZES[activityType] || 5
    recentPacesRef.current = []
    setSmoothedPace(0)
  }, [activityType])

  const startIconPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseAnim, {
          toValue: 1.2,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }

  const startIconMoveAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconMoveAnim, {
          toValue: 5,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconMoveAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }

  const startSpinAnimation = () => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start()
  }

  const startSatellitePulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(satellitePulseAnim, {
          toValue: 1.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(satellitePulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }

  const animateScreenElements = () => {
    fadeAnim.setValue(1)
  }

  const animateSaveDiscardIn = () => {
    saveDiscardFadeAnim.setValue(0)
    saveDiscardSlideAnim.setValue(0)
    Animated.parallel([
      Animated.timing(saveDiscardFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(saveDiscardSlideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }

  const animateSaveDiscardOut = () => {
    Animated.parallel([
      Animated.timing(saveDiscardFadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(saveDiscardSlideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }

  const stopAnimations = () => {
    iconPulseAnim.stopAnimation()
    iconMoveAnim.stopAnimation()
    spinAnim.stopAnimation()
    questPulseAnim.stopAnimation()
    satellitePulseAnim.stopAnimation()
    iconPulseAnim.setValue(1)
    iconMoveAnim.setValue(0)
    spinAnim.setValue(0)
    questPulseAnim.setValue(1)
    satellitePulseAnim.setValue(1)
  }

  useEffect(() => {
    if (tracking) {
      startIconPulseAnimation()
    } else if (!isTrackingLoading) {
      startIconMoveAnimation()
    }

    if (isTrackingLoading) {
      startSpinAnimation()
    }

    if (loading) {
      startSatellitePulseAnimation()
    }

    return () => {
      stopAnimations()
    }
  }, [tracking, isTrackingLoading, loading])

  useEffect(() => {
    if (!loading) {
      animateScreenElements()
    }
  }, [loading])

  useEffect(() => {
    const activityEnded = !tracking && !isPaused && coordinates.length > 0
    if (activityEnded) {
      animateSaveDiscardIn()
    } else {
      animateSaveDiscardOut()
    }
  }, [tracking, isPaused, coordinates.length])

  const showModal = (title, message, options = {}, type = "info", icon = null, buttons = []) => {
    if (options === null || options === undefined) {
      options = {}
    }

    const onConfirm = typeof options === "function" ? options : options.onConfirm
    const modalType = options.type || type
    const modalIcon = options.icon || icon
    const modalButtons = options.buttons || buttons

    setModalContent({
      title,
      message,
      onConfirm,
      type: modalType,
      icon: modalIcon,
      buttons: modalButtons,
    })
    setModalVisible(true)
  }

  const backAction = () => {
    if (tracking || isPaused) {
      showModal(
        "Exit Activity",
        "What would you like to do with your current activity?",
        null,
        "info",
        "question-circle",
        [
          {
            label: "Save",
            action: () => {
              saveActivity()
              return true
            },
            style: "primary",
          },
          {
            label: "Discard",
            action: () => {
              handleDiscard()
              return false
            },
            style: "danger",
          },
          {
            label: "Continue",
            action: () => {
              return true
            },
            style: "secondary",
          },
        ],
      )
      return true
    }
    return false
  }

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction)
    return () => backHandler.remove()
  }, [tracking, isPaused, coordinates.length])

  useEffect(() => {
    const initialize = async () => {
      try {
        const hasPermission = await requestPermissions()
        if (!hasPermission) {
          setError("Location permissions are required to use this feature.")
          return
        }

        // START WATCHING HEADING (COMPASS)
        // Primary source of heading. Use trueHeading if available, else magHeading.
        headingWatchRef.current = await Location.watchHeadingAsync((obj) => {
          const newHeading = obj.trueHeading || obj.magHeading || 0;
          setHeading(newHeading);
          headingRef.current = newHeading;

          // Smoothly animate camera rotation if in Follow Mode + Not Moving Fast (GPS takes over when moving)
          // or simply update heading for next camera frame
          if (isFollowingUserRef.current && mapRotationEnabled && (!lastCoordinateRef.current || !lastCoordinateRef.current.speed || lastCoordinateRef.current.speed < 1)) {
            if (mapRef.current && currentLocation) {
              // Subtle update for compass rotation while standing still
              mapRef.current.animateCamera({
                heading: newHeading
              }, { duration: 500 });
            }
          }
        });

        if (!currentLocation) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          });
        }

        await startLocationUpdates()
        // Only auto-start tracking if indicated by initial props, otherwise wait
        if (initialTracking) {
          await startTracking()
        }
      } catch (err) {
        console.error("Initialization error:", err)
        setError("Failed to initialize. Please check your location settings.")
      }
    }

    initialize()

    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === "active") {
        if (!tracking && locationPermissionGranted && !locationWatchRef.current) {
          startLocationUpdates()
        }
      }
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      subscription?.remove()
      if (locationWatchRef.current) locationWatchRef.current.remove()
      if (headingWatchRef.current) headingWatchRef.current.remove()
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // --- IDLE STATE TRACKING ---
  // Keeps the marker moving even when not recording a run.
  const startLocationUpdates = async () => {
    try {
      if (locationWatchRef.current) {
        try {
          await locationWatchRef.current.remove?.()
        } catch { }
        locationWatchRef.current = null
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: locationAccuracy,
        timeout: 10000,
      })

      const newRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }

      // Initialize the animated coordinate for the marker
      if (Platform.OS === 'android' && markerRef.current) {
        markerRef.current.animateMarkerToCoordinate(location.coords, 0);
      } else {
        animatedCoordinate.setValue({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005
        });
      }

      setCurrentLocation(newRegion)

      // Initial Camera Set
      updateCamera(location.coords, headingRef.current);

      // Keep updating location on map even when not tracking
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1, // High sensitivity for smooth movement
          timeInterval: 500,
        },
        (loc) => {
          const { latitude, longitude, accuracy } = loc.coords
          const region = {
            latitude,
            longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }
          setCurrentLocation(region)

          // --- ROBUST HEADING FALLBACK ---
          // 1. Try GPS Course (heading) if available and moving
          if (loc.coords.heading !== undefined && loc.coords.heading !== null && loc.coords.speed > 0.5) {
            setHeading(loc.coords.heading);
            headingRef.current = loc.coords.heading;
          }
          // 2. Fallback to Manual Bearing Calculation if no GPS course but moving
          else if (lastCoordinateRef.current && loc.coords.speed > 0.5) {
            const bearing = calculateBearing(
              lastCoordinateRef.current.latitude,
              lastCoordinateRef.current.longitude,
              latitude,
              longitude
            );
            setHeading(bearing);
            headingRef.current = bearing;
          }

          lastCoordinateRef.current = { latitude, longitude, speed: loc.coords.speed };

          // --- ANIMATE MARKER ---
          if (Platform.OS === 'android') {
            if (markerRef.current) {
              markerRef.current.animateMarkerToCoordinate({ latitude, longitude }, 500);
            }
          } else {
            animatedCoordinate.timing({
              latitude,
              longitude,
              duration: 500,
              useNativeDriver: false,
            }).start();
          }

          // Auto-Center if Follow Mode is active
          if (isFollowingUserRef.current) {
            updateCamera({ latitude, longitude }, headingRef.current);
          }
        },
      )

      locationWatchRef.current = subscription
      setLoading(false)
    } catch (err) {
      console.error("Location updates error:", err)
      setError("Failed to get location updates. Please check GPS settings.")
      setLoading(false)
    }
  }

  const requestPermissions = async () => {
    try {
      const enabled = await Location.hasServicesEnabledAsync()
      if (!enabled) {
        showModal(
          "Location Services Disabled",
          "Please enable location services to use this feature",
          () => Location.enableNetworkProviderAsync(),
          "error",
          "exclamation-circle",
        )
        return false
      }

      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== "granted") {
        showModal(
          "Permission Denied",
          "This app requires location access to track your activity.",
          null,
          "error",
          "ban",
        )
        return false
      }

      setLocationPermissionGranted(true)
      if (isAndroid) {
        await Location.requestBackgroundPermissionsAsync()
      }

      return true
    } catch (err) {
      console.error("Permission error:", err)
      showModal("Error", "Failed to request permissions.", null, "error", "exclamation-circle")
      return false
    }
  }

  const getCurrentLocation = async () => {
    try {
      const hasPermission = await requestPermissions()
      if (!hasPermission) return

      const location = await Location.getCurrentPositionAsync({
        accuracy: locationAccuracy,
        timeout: 10000,
      })

      const newRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }

      setCurrentLocation(newRegion)
      if (mapRef.current) {
        updateCamera(location.coords, headingRef.current);
      }

      return location
    } catch (err) {
      console.error(err)
      setError("Failed to get location. Ensure GPS is enabled.")
      throw err
    }
  }

  // --- ENHANCED TRACKING LOGIC ---
  const startTracking = async () => {
    console.log("MapScreen: Starting tracking with Speed-Based Pace")
    setIsTrackingLoading(true)

    // Reset last movement time on start
    lastMovementTimeRef.current = Date.now();

    if (!sessionStartRef.current) {
      sessionStartRef.current = Date.now()
    }

    try {
      const hasPermission = await requestPermissions()
      if (!hasPermission) {
        setError("Location permissions not granted.")
        setIsTrackingLoading(false)
        return
      }

      // Kill any existing watchers
      if (locationWatchRef.current) {
        try {
          await locationWatchRef.current.remove?.()
        } catch { }
        locationWatchRef.current = null
      }

      let initialLocation
      if (currentLocation) {
        initialLocation = {
          coords: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: 10,
            altitude: 0,
            speed: 0, // Ensure speed exists
          },
          timestamp: Date.now(),
        }
      } else {
        initialLocation = await getCurrentLocation()
        if (!initialLocation) {
          setError("Failed to get initial location.")
          setIsTrackingLoading(false)
          return
        }
      }

      // Initialize Kalman Filter
      const initialLat = initialLocation.coords.latitude;
      const initialLng = initialLocation.coords.longitude;

      latKalmanRef.current = new KalmanFilter(3, 10);
      lngKalmanRef.current = new KalmanFilter(3, 10);
      latKalmanRef.current.filter(initialLat, initialLocation.coords.accuracy);
      lngKalmanRef.current.filter(initialLng, initialLocation.coords.accuracy);

      const initialCoord = {
        latitude: initialLat,
        longitude: initialLng,
        timestamp: initialLocation.timestamp,
        accuracy: initialLocation.coords.accuracy,
        speed: 0,
        altitude: initialLocation.coords.altitude || 0,
      }

      // Initialize animation
      if (Platform.OS === 'android') {
        if (markerRef.current) {
          markerRef.current.animateMarkerToCoordinate(initialCoord, 0);
        }
      } else {
        animatedCoordinate.setValue({
          latitude: initialLat,
          longitude: initialLng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005
        })
      }

      if (coordinates.length === 0 || !isPaused) {
        lastCoordinateRef.current = initialCoord
        setCoordinates([initialCoord])
        startTimeRef.current = new Date()
        lastUpdateTimeRef.current = Date.now()
        lowAccuracyCountRef.current = 0
        rawCoordinatesRef.current = []
        recentPacesRef.current = []
        setSmoothedPace(0)
        setStats({
          distance: 0,
          duration: 0,
          pace: 0,
          rawPace: 0,
          avgSpeed: 0,
          steps: 0,
          reps: 0,
          elevationGain: 0,
        })
      } else {
        lastCoordinateRef.current = coordinates[coordinates.length - 1] || initialCoord
        startTimeRef.current = new Date(Date.now() - stats.duration * 1000)
      }

      setTracking(true)
      setIsPaused(false)
      setFollowingSuggestedRoute(followingSuggestedRoute)

      // Auto-enable map rotation for immersive tracking experience
      setMapRotationEnabled(true);

      if (intervalRef.current) clearInterval(intervalRef.current)

      // 1. STATS TIMER (Duration Only)
      intervalRef.current = setInterval(() => {
        setStats((prev) => {
          const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
          // Only calculate Average Speed based on total distance/time
          const distanceKm = (prev.distance || 0) / 1000
          const avgSpeed = distanceKm > 0 && duration > 0 ? distanceKm / (duration / 3600) : 0

          return { ...prev, duration, avgSpeed }
        })
      }, 1000)

      // 2. LOCATION WATCHER (Distance & Pace)
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1, // Reduced for smoother camera
          timeInterval: 1000,
        },
        (loc) => {
          const { latitude, longitude, accuracy, speed = 0, altitude = 0 } = loc.coords

          if (accuracy > 50) {
            lowAccuracyCountRef.current += 1
            if (lowAccuracyCountRef.current >= 5) setGpsSignal("Poor")
            return
          }

          lowAccuracyCountRef.current = 0
          if (accuracy <= 15) setGpsSignal("Excellent")
          else if (accuracy <= 30) setGpsSignal("Good")
          else if (accuracy <= 50) setGpsSignal("Fair")
          else setGpsSignal("Poor")

          // Kalman Filter
          const filteredLat = latKalmanRef.current.filter(latitude, accuracy);
          const filteredLng = lngKalmanRef.current.filter(longitude, accuracy);

          const smoothedCoordinate = {
            latitude: filteredLat,
            longitude: filteredLng,
            timestamp: Date.now(),
            accuracy: accuracy,
            speed: parseFloat(speed.toFixed(2)),
            altitude: parseFloat(altitude.toFixed(1)),
          }

          // Fallback Heading Calculation (IMPORTANT FOR BEAM)
          const lastCoord = lastCoordinateRef.current
          if (lastCoord) {
            // Override heading if we are moving significantly (GPS is more reliable than compass for direction when moving)
            if (speed > 1) {
              if (loc.coords.heading !== undefined && loc.coords.heading !== null) {
                setHeading(loc.coords.heading);
                headingRef.current = loc.coords.heading;
              } else {
                const bearing = calculateBearing(lastCoord.latitude, lastCoord.longitude, filteredLat, filteredLng);
                setHeading(bearing);
                headingRef.current = bearing;
              }
            }
          }

          // Animate Marker
          if (Platform.OS === 'android') {
            if (markerRef.current) {
              markerRef.current.animateMarkerToCoordinate(smoothedCoordinate, 1000);
            }
          } else {
            animatedCoordinate.timing({
              latitude: filteredLat,
              longitude: filteredLng,
              duration: 1000,
              useNativeDriver: false,
            }).start();
          }

          // Calculate Distance & Pace
          if (lastCoord) {
            const nowMs = smoothedCoordinate.timestamp
            const lastMs = lastUpdateTimeRef.current || nowMs
            lastUpdateTimeRef.current = nowMs

            const dHav = calculateDistance(
              lastCoord.latitude,
              lastCoord.longitude,
              smoothedCoordinate.latitude,
              smoothedCoordinate.longitude,
            )

            // Only add distance if it exceeds threshold (reduces jitter)
            const distanceIncrement = dHav >= distanceThreshold ? dHav : 0

            // --- MOTION-AWARE PACE SMOOTHING ---
            let smoothedPaceVal = 0;

            // Threshold: 0.8 m/s is approx 2.9 km/h (slow walk)
            if (speed > 0.8) {
              lastMovementTimeRef.current = Date.now();
              const instantPace = 16.6667 / speed;
              smoothedPaceVal = calculateMovingAveragePace(instantPace);
            } else {
              // Check inactivity duration
              const timeSinceLastMove = Date.now() - lastMovementTimeRef.current;

              if (timeSinceLastMove > 3000) { // 3 seconds inactivity threshold
                // Force stop
                smoothedPaceVal = 0;
                recentPacesRef.current = []; // Clear buffer to ensure immediate 0 and fresh start
              } else {
                // Decelerating phase - feed 0 into average to smooth down
                smoothedPaceVal = calculateMovingAveragePace(0);
              }
            }

            setSmoothedPace(smoothedPaceVal);

            // Elevation
            let elevationGainIncrement = 0;
            const currentAltitude = smoothedCoordinate.altitude || 0;
            const lastAltitude = lastCoord.altitude || 0;

            if (currentAltitude !== 0 && lastAltitude !== 0 && accuracy < 20) {
              const altDiff = currentAltitude - lastAltitude;
              if (altDiff > 1.5) {
                elevationGainIncrement = altDiff;
              }
            }

            setStats((prevStats) => {
              const newDistance = (prevStats.distance || 0) + distanceIncrement

              return {
                ...prevStats,
                distance: newDistance,
                pace: smoothedPaceVal, // Update UI with smoothed pace
                elevationGain: (prevStats.elevationGain || 0) + elevationGainIncrement,
              }
            })
          }

          setCoordinates((prev) => [...prev, smoothedCoordinate])
          lastCoordinateRef.current = smoothedCoordinate

          // --- STRICT CAMERA FOLLOW ---
          if (isFollowingUserRef.current) {
            updateCamera({ latitude: filteredLat, longitude: filteredLng }, headingRef.current);
          }
        },
      )

      locationWatchRef.current = subscription
    } catch (err) {
      console.error("MapScreen: Start tracking error:", err)
      setError("Failed to start tracking.")
      stopTracking()
    } finally {
      setIsTrackingLoading(false)
    }
  }

  const togglePause = () => {
    if (tracking) {
      stopTracking()
      setIsPaused(true)
      showModal(
        "Activity Paused",
        "Your activity has been paused. Tap 'Resume' to continue.",
        null,
        "info",
        "pause-circle",
      )
    } else if (isPaused) {
      startTracking()
    }
  }

  const stopTracking = async () => {
    console.log("MapScreen: Stopping tracking (final)")
    setIsTrackingLoading(true)

    try {
      if (watchId && typeof watchId.remove === "function") {
        watchId.remove()
        setWatchId(null)
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      setTracking(false)
      setIsPaused(false)
      setFollowingSuggestedRoute(false)
      Vibration.vibrate(200)

      // Revert to non-tilted view when stopped
      setMapRotationEnabled(false);

      await startLocationUpdates()
    } catch (err) {
      console.error("MapScreen: Stop tracking error:", err)
      setError("Failed to stop tracking.")
    } finally {
      setIsTrackingLoading(false)
    }
  }

  const handleDiscard = () => {
    showModal(
      "Discard Activity",
      "Are you sure you want to discard this activity? All progress will be lost.",
      null,
      "danger",
      "trash",
      [
        {
          label: "Yes, Discard",
          action: () => {
            setCoordinates([])
            setStats({ distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0, elevationGain: 0 })
            setIsPaused(false)
            setTracking(false)

            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }

            if (selectedQuest?.durationMinutes) {
              const initialSeconds = selectedQuest.durationMinutes * 60;
              setRemainingSecs(initialSeconds);
              timerInitializedRef.current = true;
            } else {
              setRemainingSecs(null);
              timerInitializedRef.current = false;
            }

            if (selectedQuest) {
              const resetQuest = QuestProgressManager.resetSession(selectedQuest)
              setSelectedQuest(resetQuest)
            }

            navigateToActivity({ activityType })
            return true
          },
          style: "danger",
        },
        {
          label: "Cancel",
          action: () => true,
          style: "secondary",
        },
      ],
    )
  }

  const resetTrackingState = () => {
    setTracking(false)
    setIsPaused(false)
    setSmoothedPace(0)
    setGpsSignal("Searching")
    setCoordinates([])
    if (coordinatesRef) coordinatesRef.current = []
    setStats({
      distance: 0,
      duration: 0,
      pace: 0,
      rawPace: 0,
      avgSpeed: 0,
      steps: 0,
      reps: 0,
      calories: 0,
      elevationGain: 0,
      elevationLoss: 0,
      maxSpeed: 0,
    })
  }

  const saveActivity = async () => {
    try {
      setIsTrackingLoading(true);
      const user = auth.currentUser;

      if (!user) {
        showModal("Error", "You must be logged in to save activities.");
        setIsTrackingLoading(false);
        return;
      }

      const calculateCalories = (type, durationInSeconds) => {
        const metValues = {
          walking: 3.5,
          running: 9.8,
          jogging: 7.0,
          cycling: 7.5,
        };

        const met = metValues[type] || 3.5;
        const weightKg = 70;
        const durationHours = durationInSeconds / 3600;
        const calculated = Math.round(met * weightKg * durationHours);
        return calculated > 0 ? calculated : 0;
      };

      const calculatedCalories = calculateCalories(activityType, ensureNumeric(stats.duration));
      const coords = Array.isArray(coordinates) ? coordinates : [];

      let finalAveragePace = 0;
      if (ensureNumeric(stats.distance) > 0) {
        finalAveragePace = (ensureNumeric(stats.duration) / 60) / (ensureNumeric(stats.distance) / 1000);
      }
      if (!isFinite(finalAveragePace) || finalAveragePace > 60) {
        finalAveragePace = 0;
      }

      const activityData = {
        userId: user.uid,
        activityType,
        distance: ensureNumeric(stats.distance),
        duration: ensureNumeric(stats.duration),
        avgSpeed: ensureNumeric(stats.avgSpeed),
        pace: finalAveragePace,
        maxSpeed: ensureNumeric(stats.maxSpeed),
        elevationGain: ensureNumeric(stats.elevationGain),
        elevationLoss: ensureNumeric(stats.elevationLoss),
        steps: ensureNumeric(stats.steps),
        calories: calculatedCalories,
        coordinates: coords,
        createdAt: serverTimestamp(),
        startLocation: coords.length
          ? {
            latitude: coords[0].latitude,
            longitude: coords[0].longitude,
            timestamp: coords[0].timestamp,
          }
          : null,
        endLocation: coords.length
          ? {
            latitude: coords[coords.length - 1].latitude,
            longitude: coords[coords.length - 1].longitude,
            timestamp: coords[coords.length - 1].timestamp,
          }
          : null,
      };

      const activityParams = {
        activityType: activityType,
        questId: selectedQuest?.id || null,
        challengeId: selectedQuest?.category === 'challenge' ? selectedQuest.id : null,
        category: selectedQuest?.category || 'normal',
        isChallenge: selectedQuest?.category === 'challenge',
        groupType: selectedQuest?.groupType || null,
        mode: selectedQuest?.mode || null,
      };

      const sessionStartTime = sessionStartRef.current || Date.now();
      const activityId = XPManager.generateActivityId(user.uid, sessionStartTime);

      const xpResult = await XPManager.awardXPForActivity({
        userId: user.uid,
        activityId,
        activityData,
        stats: {
          distance: ensureNumeric(stats.distance),
          duration: ensureNumeric(stats.duration),
          steps: ensureNumeric(stats.steps),
          calories: calculatedCalories,
        },
        activityParams,
        questData: selectedQuest?.category === 'challenge' ? null : selectedQuest,
        challengeData: selectedQuest?.category === 'challenge' ? selectedQuest : null,
        isStrengthActivity: false,
      });

      await setDoc(
        doc(db, "activities", activityId),
        {
          ...activityData,
          xpEarned: xpResult.xpEarned || 0,
          bonusXP: xpResult.bonusXP || 0,
          questCompleted: !!xpResult.questCompleted,
          challengeCompleted: !!xpResult.challengeCompleted,
          questId: selectedQuest?.id || null,
          challengeId: selectedQuest?.category === 'challenge' ? selectedQuest.id : null,
        },
        { merge: true }
      );

      const successMessage =
        `Great ${activityType} session!\n\n` +
        `• ${formatDistance(stats.distance)} covered\n` +
        `• ${formatDuration(stats.duration)} duration\n` +
        `• ${formatSpeedKmh(stats.avgSpeed)} avg speed\n` +
        `• ${stats.elevationGain?.toFixed(0) || 0}m elevation gain\n` +
        `• ${calculatedCalories} calories burned` +
        (xpResult?.xpEarned
          ? `\n• ${xpResult.xpEarned} XP earned${xpResult.bonusXP ? ` (+${xpResult.bonusXP} bonus)` : ""}`
          : "");

      showModal(
        "Activity Saved",
        successMessage,
        async () => {
          try {
            if (locationWatchRef.current) {
              try {
                locationWatchRef.current.remove?.();
              } catch { }
              locationWatchRef.current = null;
            }

            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }

            resetTrackingState();

            if (typeof navigateToDashboard === "function") {
              navigateToDashboard();
            } else if (navigation && typeof navigation.navigate === "function") {
              navigation.navigate("Dashboard");
            }
          } catch (e) {
            console.error("Modal confirm error:", e);
          }
        },
        "success",
        "check-circle",
        []
      );
    } catch (error) {
      console.error("MapScreen saveActivity error:", error);
      showModal("Error", "Failed to save activity. Please try again.");
    } finally {
      setIsTrackingLoading(false);
    }
  };

  const handleMapStyleSelect = (index) => {
    setCurrentMapStyleIndex(index)
    setShowMapStylePicker(false)
  }

  const currentMapStyle = MAP_STYLES[currentMapStyleIndex]

  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const mapToggleAnim = useRef(new Animated.Value(0)).current

  const toggleMapView = () => {
    const toValue = isMapFullscreen ? 0 : 1
    setIsMapFullscreen(!isMapFullscreen)
    Animated.timing(mapToggleAnim, {
      toValue,
      duration: 300,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      useNativeDriver: false,
    }).start()
  }

  const isActivityIdle = !tracking && !isPaused && coordinates.length === 0
  const isActivityTracking = tracking
  const isActivityPaused = !tracking && isPaused
  const isActivityEnded = !tracking && !isPaused && coordinates.length > 0

  return (
    <View style={twrnc`flex-1 bg-black`}>
      <StatusBar barStyle="light-content" />
      {/* Modal */}
      <CustomModal
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        onConfirm={modalContent.onConfirm}
        onCancel={() => setModalVisible(false)}
        onClose={() => setModalVisible(false)}
        type={modalContent.type}
        icon={modalContent.icon}
        buttons={modalContent.buttons}
      />

      {/* Map Style Picker Modal */}
      <CustomModal
        visible={showMapStylePicker}
        title="Select Map Style"
        message="Choose your preferred map visual style."
        onConfirm={() => setShowMapStylePicker(false)}
        onCancel={() => setShowMapStylePicker(false)}
        onClose={() => setShowMapStylePicker(false)}
        type="info"
        icon="map"
        buttons={MAP_STYLES.map((style, index) => ({
          label: style.name,
          action: () => handleMapStyleSelect(index),
          style: index === currentMapStyleIndex ? "primary" : "secondary",
        }))}
      />

      {/* Map Container - Always fullscreen */}
      <MapView
        ref={mapRef}
        style={twrnc`absolute inset-0`}
        provider={PROVIDER_GOOGLE}
        initialRegion={currentLocation}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        loadingEnabled={true}
        moveOnMarkerPress={false}
        toolbarEnabled={false}
        pitchEnabled={true}
        rotateEnabled={true}
        mapType={currentMapStyle.mapType}
        customMapStyle={currentMapStyle.style}
        onPanDrag={handleManualDrag} // Stops following when user drags
      >

        {/* Dynamic Activity Icon Marker */}
        {currentLocation && (
          <Marker.Animated
            ref={markerRef}
            coordinate={animatedCoordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            style={{ zIndex: 999 }}
          >
            <View style={twrnc`items-center`}>
              <View
                style={[
                  twrnc`p-3 rounded-full border-3 border-white items-center justify-center shadow-lg`,
                  { backgroundColor: currentActivity.color },
                ]}
              >
                <Image
                  source={currentActivity.icon}
                  style={{ width: 20, height: 20, tintColor: 'white' }}
                  resizeMode="contain"
                />
              </View>
              {/* Pointer Triangle */}
              <View
                style={twrnc`w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -mt-0.5`}
              />
            </View>
          </Marker.Animated>
        )}

        {showSuggestedRoute && suggestedRoute && (
          <>
            <Polyline
              coordinates={suggestedRoute.coordinates}
              strokeColor={followingSuggestedRoute ? currentActivity.strokeColor : "#3B82F6"}
              strokeWidth={followingSuggestedRoute ? 12 : 10}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
              style={{ opacity: 0.4 }}
            />
            <Polyline
              coordinates={suggestedRoute.coordinates}
              strokeColor={followingSuggestedRoute ? currentActivity.strokeColor : "#3B82F6"}
              strokeWidth={followingSuggestedRoute ? 8 : 6}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
              tappable={true}
              onPress={() => {
                showModal(
                  "Suggested Route",
                  `Follow this ${suggestedRoute.distance} km ${suggestedRoute.routeType} route?`,
                  () => {
                    setFollowingSuggestedRoute(true)
                  },
                  "info",
                  "map-signs",
                )
              }}
            />

            {/* Start/End Waypoints */}
            {suggestedRoute.waypoints.map((waypoint, index) => (
              <Marker
                key={`waypoint-${index}`}
                coordinate={{
                  latitude: waypoint.latitude,
                  longitude: waypoint.longitude,
                }}
              >
                <View style={twrnc`items-center`}>
                  <View
                    style={[
                      twrnc`p-2.5 rounded-full border-2 border-white shadow-lg`,
                      {
                        backgroundColor:
                          waypoint.type === "start" ? "#10B981" : waypoint.type === "end" ? "#EF4444" : "#3B82F6",
                      },
                    ]}
                  >
                    <FontAwesome
                      name={waypoint.type === "start" ? "play" : waypoint.type === "end" ? "stop" : "map-marker"}
                      size={16}
                      color="white"
                    />
                  </View>
                </View>
              </Marker>
            ))}
          </>
        )}

        {coordinates.length > 0 && (
          <>
            <Polyline
              coordinates={coordinates}
              strokeColor={currentActivity.strokeColor}
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />

            {!followingSuggestedRoute && (
              <Marker coordinate={coordinates[0]}>
                <View style={twrnc`items-center`}>
                  <View style={twrnc`bg-green-500 p-2.5 rounded-full border-3 border-white shadow-lg`}>
                    <FontAwesome name="flag" size={16} color="white" />
                  </View>
                </View>
              </Marker>
            )}

            {!tracking && !isPaused && coordinates.length > 1 && !followingSuggestedRoute && (
              <Marker coordinate={coordinates[coordinates.length - 1]}>
                <View style={twrnc`items-center`}>
                  <View style={twrnc`bg-red-500 p-2.5 rounded-full border-3 border-white shadow-lg`}>
                    <FontAwesome name="flag" size={16} color="white" />
                  </View>
                </View>
              </Marker>
            )}
          </>
        )}
      </MapView>

      {/* TOP CONTROLS & INFO */}
      <View style={twrnc`absolute top-12 left-0 right-0 z-50 px-4`}>
        {/* Timer and XP Badge */}
        <View style={twrnc`flex-row justify-center items-center gap-4 mb-4`}>
          {remainingSecs !== null && (
            <View style={twrnc`bg-purple-600 rounded-full border border-purple-400/50 shadow-lg px-4 py-1.5`}>
              <CustomText weight="bold" style={twrnc`text-white text-base font-mono`}>
                {formatTime(remainingSecs)}
              </CustomText>
            </View>
          )}

          {selectedQuest?.stakeXP && selectedQuest.stakeXP > 0 && (
            <View style={twrnc`bg-amber-600 rounded-full border border-amber-400/50 shadow-lg px-4 py-1.5`}>
              <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                {selectedQuest.stakeXP} XP Stake
              </CustomText>
            </View>
          )}
        </View>

        {/* Right Side Map Controls */}
        <View style={twrnc`absolute top-0 right-4 flex-col gap-3`}>
          {/* Compass / Orientation Toggle */}
          <TouchableOpacity
            style={[
              twrnc`w-10 h-10 rounded-full items-center justify-center shadow-lg border border-white/20`,
              { backgroundColor: mapRotationEnabled ? currentActivity.color : 'rgba(30, 41, 59, 0.8)' }
            ]}
            onPress={toggleMapRotation}
          >
            <Ionicons
              name={mapRotationEnabled ? "compass" : "compass-outline"}
              size={22}
              color="white"
            />
          </TouchableOpacity>

          {/* Recenter Button (only shows when user dragged away) */}
          {!isFollowingUser && (
            <TouchableOpacity
              style={twrnc`w-10 h-10 bg-white rounded-full items-center justify-center shadow-lg`}
              onPress={recenterMap}
            >
              <Ionicons name="locate" size={22} color={currentActivity.color} />
            </TouchableOpacity>
          )}

          {/* Fullscreen Toggle */}
          <TouchableOpacity
            style={twrnc`w-10 h-10 bg-[#1e293b]/80 rounded-full items-center justify-center border border-white/20`}
            onPress={toggleMapView}
          >
            <Ionicons name={isMapFullscreen ? "contract" : "expand"} size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* FULLSCREEN STATS OVERLAY */}
      {isMapFullscreen && (
        <View style={twrnc`absolute top-28 left-4 bg-black/70 rounded-2xl p-4 z-40 border border-white/10`}>
          <View style={twrnc`flex-row items-center mb-2`}>
            <CustomText weight="bold" style={twrnc`text-white text-2xl mr-2`}>
              {(stats.distance / 1000).toFixed(2)}
            </CustomText>
            <CustomText style={twrnc`text-gray-300 text-xs uppercase`}>km</CustomText>
          </View>
          <View style={twrnc`flex-row items-center mb-2`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mr-2`}>
              {stats.avgSpeed.toFixed(1)}
            </CustomText>
            <CustomText style={twrnc`text-gray-300 text-xs uppercase`}>km/h</CustomText>
          </View>
          <View style={twrnc`flex-row items-center`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mr-2 font-mono`}>
              {formatDuration(stats.duration)}
            </CustomText>
          </View>
        </View>
      )}

      {/* BOTTOM SLIDE-UP DRAWER (Standard View) */}
      {!isMapFullscreen && (
        <Animated.View
          style={[
            twrnc`absolute bottom-0 left-0 right-0 bg-[#0f172a] shadow-2xl`,
            {
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              paddingBottom: Platform.OS === 'ios' ? 34 : 24,
              elevation: 20,
            },
          ]}
        >
          {/* Handle */}
          <View style={twrnc`w-12 h-1 bg-gray-700/50 rounded-full self-center mt-3 mb-2`} />

          {/* Quest Banner */}
          {selectedQuest && (
            <Animated.View
              style={[
                twrnc`mx-5 mb-4 mt-2`,
                { opacity: fadeAnim, transform: [{ scale: questPulseAnim }] }
              ]}
            >
              <LinearGradient
                colors={
                  getQuestStatus(selectedQuest) === "completed"
                    ? ["#10B981", "#059669"]
                    : ["#F59E0B", "#D97706"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={twrnc`p-3.5 rounded-2xl shadow-lg border border-white/10`}
              >
                <View style={twrnc`flex-row items-center justify-between`}>
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`bg-white/20 rounded-full p-2 mr-3`}>
                      <FontAwesome
                        name={getQuestStatus(selectedQuest) === "completed" ? "trophy" : "bullseye"}
                        size={14}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={twrnc`flex-1`}>
                      <CustomText weight="bold" numberOfLines={1} style={twrnc`text-white text-sm`}>
                        {selectedQuest.title}
                      </CustomText>
                      {selectedQuest.category !== 'challenge' && (
                        <View style={twrnc`flex-row items-center mt-1`}>
                          <View style={twrnc`flex-1 h-1 bg-black/20 rounded-full overflow-hidden mr-2`}>
                            <View style={[
                              twrnc`h-full rounded-full bg-white`,
                              { width: `${Math.min(getDisplayQuestProgress(selectedQuest) * 100, 100)}%` }
                            ]} />
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedQuest(null)} style={twrnc`ml-2`}>
                    <FontAwesome name="times" size={12} color="white" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Stats Grid */}
          <View style={twrnc`px-5 mb-6`}>
            <View style={twrnc`flex-row flex-wrap justify-between gap-3`}>

              {/* Distance */}
              <View style={twrnc`w-[48%] bg-[#1e293b] rounded-2xl p-3.5 border border-white/5`}>
                <View style={twrnc`flex-row justify-between mb-1`}>
                  <CustomText style={twrnc`text-gray-400 text-[10px] uppercase font-bold tracking-wider`}>Distance</CustomText>
                  <Ionicons name="map" size={14} color={currentActivity.color || "#4361EE"} />
                </View>
                <View style={twrnc`flex-row items-baseline`}>
                  <CustomText weight="bold" style={twrnc`text-white text-2xl mr-1`}>
                    {(stats.distance / 1000).toFixed(2)}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-xs`}>km</CustomText>
                </View>
              </View>

              {/* Time */}
              <View style={twrnc`w-[48%] bg-[#1e293b] rounded-2xl p-3.5 border border-white/5`}>
                <View style={twrnc`flex-row justify-between mb-1`}>
                  <CustomText style={twrnc`text-gray-400 text-[10px] uppercase font-bold tracking-wider`}>Time</CustomText>
                  <Ionicons name="time" size={14} color="#FFC107" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-2xl font-mono`}>
                  {formatDuration(stats.duration)}
                </CustomText>
              </View>

              {/* Speed/Pace */}
              <View style={twrnc`w-[48%] bg-[#1e293b] rounded-2xl p-3.5 border border-white/5`}>
                <View style={twrnc`flex-row justify-between mb-1`}>
                  <CustomText style={twrnc`text-gray-400 text-[10px] uppercase font-bold tracking-wider`}>
                    {activityType === "cycling" ? "Speed" : "Pace"}
                  </CustomText>
                  <Ionicons name="speedometer" size={14} color="#06D6A0" />
                </View>
                <View style={twrnc`flex-row items-baseline`}>
                  <CustomText weight="bold" style={twrnc`text-white text-2xl mr-1`}>
                    {activityType === "cycling" ? stats.avgSpeed.toFixed(1) : formatPacePerKm(stats.pace)}
                  </CustomText>
                  {activityType === "cycling" && <CustomText style={twrnc`text-gray-500 text-xs`}>km/h</CustomText>}
                </View>
              </View>

              {/* Elevation */}
              <View style={twrnc`w-[48%] bg-[#1e293b] rounded-2xl p-3.5 border border-white/5`}>
                <View style={twrnc`flex-row justify-between mb-1`}>
                  <CustomText style={twrnc`text-gray-400 text-[10px] uppercase font-bold tracking-wider`}>Elevation</CustomText>
                  <Ionicons name="trending-up" size={14} color="#EF476F" />
                </View>
                <View style={twrnc`flex-row items-baseline`}>
                  <CustomText weight="bold" style={twrnc`text-white text-2xl mr-1`}>
                    {Math.round(stats.elevationGain || 0)}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-xs`}>m</CustomText>
                </View>
              </View>

            </View>
          </View>

          {/* Action Buttons */}
          <View style={twrnc`px-6 flex-row items-center justify-center gap-6`}>
            {/* START */}
            {isActivityIdle && (
              <TouchableOpacity
                style={[
                  twrnc`w-20 h-20 rounded-full items-center justify-center shadow-2xl shadow-blue-500/30`,
                  { backgroundColor: currentActivity.color },
                ]}
                onPress={() => startTracking()}
                disabled={isTrackingLoading}
              >
                {isTrackingLoading ? (
                  <ActivityIndicator size="large" color="white" />
                ) : (
                  <Ionicons name="play" size={32} color="white" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            )}

            {/* PAUSE / RESUME / STOP */}
            {(isActivityTracking || isActivityPaused) && (
              <>
                <TouchableOpacity
                  style={[
                    twrnc`w-16 h-16 rounded-full items-center justify-center shadow-lg border-4`,
                    {
                      backgroundColor: isPaused ? "#10B981" : "#1e293b",
                      borderColor: isPaused ? "#10B981" : currentActivity.color
                    },
                  ]}
                  onPress={togglePause}
                >
                  <Ionicons name={isPaused ? "play" : "pause"} size={26} color="white" />
                </TouchableOpacity>

                {isActivityPaused && (
                  <TouchableOpacity
                    style={twrnc`w-16 h-16 rounded-full items-center justify-center bg-red-500 shadow-lg shadow-red-500/40`}
                    onPress={() => stopTracking()}
                  >
                    <Ionicons name="stop" size={26} color="white" />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* SAVE / DISCARD */}
            {isActivityEnded && (
              <View style={twrnc`flex-row flex-1 gap-4`}>
                <TouchableOpacity
                  style={twrnc`flex-1 bg-emerald-600 py-4 rounded-2xl items-center justify-center shadow-lg shadow-emerald-600/20`}
                  onPress={saveActivity}
                  disabled={isTrackingLoading}
                >
                  {isTrackingLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <View style={twrnc`flex-row items-center`}>
                      <Ionicons name="checkmark-circle" size={20} color="white" style={twrnc`mr-2`} />
                      <CustomText weight="bold" style={twrnc`text-white`}>Save</CustomText>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={twrnc`w-14 bg-[#1e293b] rounded-2xl items-center justify-center border border-red-500/30`}
                  onPress={handleDiscard}
                  disabled={isTrackingLoading}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF476F" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Loading Overlay */}
      {loading && (
        <View style={twrnc`absolute inset-0 bg-black/80 items-center justify-center z-50`}>
          <ActivityIndicator size="large" color={currentActivity.color} />
          <CustomText style={twrnc`text-white mt-4 font-bold`}>Locating Satellites...</CustomText>
        </View>
      )}

    </View>
  )
}

export default MapScreen
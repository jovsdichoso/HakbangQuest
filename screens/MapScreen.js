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
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false)
  const [followingSuggestedRoute, setFollowingSuggestedRoute] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)

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

  const holdProgressAnim = useRef(new Animated.Value(0)).current
  const HOLD_DURATION = 2000
  const pan = useRef(new Animated.ValueXY({ x: width - 100, y: 16 })).current
  const recentPacesRef = useRef([])
  const paceWindowSizeRef = useRef(PACE_WINDOW_SIZES[activityType] || 5)

  // Animation refs
  const buttonScaleAnim = useRef(new Animated.Value(1)).current
  const saveButtonScaleAnim = useRef(new Animated.Value(1)).current
  const discardButtonScaleAnim = useRef(new Animated.Value(1)).current
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
  const lastCoordinateRef = useRef(null)
  const holdTimerRef = useRef(null)
  const coordinatesRef = useRef([])

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

  const locationDistanceInterval = 5
  const locationTimeInterval = activityType === "cycling" ? 1000 : 500

  const activityConfigs = {
    walking: { icon: "walk", color: "#4361EE", strokeColor: "#4361EE", darkColor: "#3651D4" },
    running: { icon: "running", color: "#EF476F", strokeColor: "#EF476F", darkColor: "#D43E63" },
    cycling: { icon: "bicycle", color: "#06D6A0", strokeColor: "#06D6A0", darkColor: "#05C090" },
    jogging: { icon: "running", color: "rgb(255, 193, 7)", strokeColor: "rgb(255, 193, 7)", darkColor: "#E6BC5C" },
  }

  const currentActivity = activityConfigs[activityType] || activityConfigs.walking
  const maxSpeed = activityType === "cycling" ? 20 : 8

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value,
        })
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset()
        setGpsIndicatorPosition({
          x: pan.x._value,
          y: pan.y._value,
        })
      },
    }),
  ).current

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
    if (selectedQuest && selectedQuest.activityType !== activityType) {
      showModal(
        "Quest Mismatch",
        `This quest is for ${selectedQuest.activityType}, but you're doing ${activityType}. Progress may not be tracked correctly.`,
        null,
        "warning",
        "exclamation-triangle",
      )
    }
  }, [selectedQuest, activityType])

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
    pan.setValue({ x: gpsIndicatorPosition.x, y: gpsIndicatorPosition.y })
  }, [])

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

        if (!currentLocation) {
          setCurrentLocation({
            latitude: 37.78825,
            longitude: -122.4324,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          })
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
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

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

      setCurrentLocation(newRegion)
      if (mapRef.current) {
        mapRef.current.animateToRegion(newRegion, 1000)
      }

      // Keep updating location on map even when not tracking (for the blue dot)
      // Note: This watcher is replaced when startTracking is called
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
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
        mapRef.current.animateToRegion(newRegion, 1000)
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

      if (intervalRef.current) clearInterval(intervalRef.current)

      // 1. STATS TIMER (Duration Only)
      // Removed the pace calculation from here because it caused the "100+ /km" bug
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
          distanceInterval: 2,
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
          const lastCoord = lastCoordinateRef.current
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

            // --- PACE CALCULATION FIX ---
            // Use GPS Speed (m/s) to calculate Instant Pace instead of Time/Dist
            let instantPace = 0;

            // Speed Threshold: Ignore pace if moving slower than 0.8 m/s (approx 3 km/h)
            // This prevents "100+ min/km" when standing still.
            if (speed > 0.8) {
              // Convert m/s to min/km:  (1000 / speed) / 60  =>  16.6667 / speed
              instantPace = 16.6667 / speed;
            }

            // Smooth the instantaneous pace so it doesn't jump wildly
            const smoothedPaceVal = calculateMovingAveragePace(instantPace);
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
                pace: smoothedPaceVal, // Update UI with smoothed INSTANT pace
                elevationGain: (prevStats.elevationGain || 0) + elevationGainIncrement,
              }
            })
          }

          setCoordinates((prev) => [...prev, smoothedCoordinate])
          lastCoordinateRef.current = smoothedCoordinate

          if (mapRef.current && tracking) {
            mapRef.current.animateToRegion({
              latitude: filteredLat,
              longitude: filteredLng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005
            }, 1000);
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

      // Stop marker animation if needed, or simply let it rest
      // Return to standard location updates
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

      const activityData = {
        userId: user.uid,
        activityType,
        distance: ensureNumeric(stats.distance),
        duration: ensureNumeric(stats.duration),
        avgSpeed: ensureNumeric(stats.avgSpeed),
        pace: ensureNumeric(stats.pace),
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

  const openMapStylePicker = () => {
    setShowMapStylePicker(true)
  }

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
        showsUserLocation={false} // Disable default location dot, we are drawing our own animated one
        showsMyLocationButton={false}
        loadingEnabled={true}
        moveOnMarkerPress={false}
        toolbarEnabled={false}
        mapType={currentMapStyle.mapType}
        customMapStyle={currentMapStyle.style}
      >

        {/* Render Animated Marker for Tracking */}
        {(!tracking && currentLocation) || (tracking) ? (
          <Marker.Animated
            ref={markerRef}
            coordinate={tracking ? animatedCoordinate : currentLocation}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={twrnc`items-center`}>
              <View
                style={[
                  twrnc`p-3 rounded-full border-3 border-white items-center justify-center shadow-lg`,
                  { backgroundColor: currentActivity.color },
                ]}
              >
                <Ionicons name={currentActivity.icon} size={18} color="white" />
              </View>
              <View
                style={twrnc`w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -mt-0.5`}
              />
            </View>
          </Marker.Animated>
        ) : null}

        {showSuggestedRoute && suggestedRoute && (
          <>
            <Polyline
              coordinates={suggestedRoute.coordinates}
              strokeColor={followingSuggestedRoute ? currentActivity.strokeColor : "#3B82F6"}
              strokeWidth={followingSuggestedRoute ? 12 : 10}
              lineDashPattern={null}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
              style={{ opacity: 0.4 }}
            />
            <Polyline
              coordinates={suggestedRoute.coordinates}
              strokeColor={followingSuggestedRoute ? currentActivity.strokeColor : "#3B82F6"}
              strokeWidth={followingSuggestedRoute ? 8 : 6}
              lineDashPattern={null}
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

            {suggestedRoute.waypoints.map((waypoint, index) => (
              <Marker
                key={`waypoint-${index}`}
                coordinate={{
                  latitude: waypoint.latitude,
                  longitude: waypoint.longitude,
                }}
                title={waypoint.name}
                description={waypoint.type}
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
                  <View
                    style={twrnc`w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -mt-0.5`}
                  />
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

            {coordinates.length > 1 && !followingSuggestedRoute && (
              <>
                <Marker coordinate={coordinates[0]}>
                  <View style={twrnc`items-center`}>
                    <View style={twrnc`bg-green-500 p-2.5 rounded-full border-3 border-white shadow-lg`}>
                      <FontAwesome name="flag" size={16} color="white" />
                    </View>
                    <View
                      style={twrnc`w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -mt-0.5`}
                    />
                  </View>
                </Marker>
                <Marker coordinate={coordinates[coordinates.length - 1]}>
                  <View style={twrnc`items-center`}>
                    <View style={twrnc`bg-red-500 p-2.5 rounded-full border-3 border-white shadow-lg`}>
                      <FontAwesome name="flag" size={16} color="white" />
                    </View>
                    <View
                      style={twrnc`w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white -mt-0.5`}
                    />
                  </View>
                </Marker>
              </>
            )}
          </>
        )}
      </MapView>

      {/* Timer and Challenge Display - Always visible on top */}
      <View style={twrnc`absolute top-12 left-0 right-0 flex-row justify-center items-center z-50 gap-4 px-4`}>
        {remainingSecs !== null && (
          <View style={twrnc`bg-purple-600 rounded-2xl border-2 border-purple-300 shadow-lg px-4 py-2`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg`}>
              {formatTime(remainingSecs)}
            </CustomText>
          </View>
        )}

        {selectedQuest?.stakeXP && selectedQuest.stakeXP > 0 && (
          <View style={twrnc`bg-amber-600 rounded-2xl border-2 border-amber-300 shadow-lg px-4 py-2`}>
            <CustomText weight="bold" style={twrnc`text-white text-sm`}>
              {selectedQuest.stakeXP} XP
            </CustomText>
          </View>
        )}
      </View>

      {/* Fullscreen mode overlays */}
      {isMapFullscreen && (
        <>
          {/* Stats overlay in top-left */}
          <View style={twrnc`absolute top-24 left-4 bg-black bg-opacity-70 rounded-2xl p-4 z-40`}>
            <View style={twrnc`flex-row items-center mb-2`}>
              <CustomText weight="bold" style={twrnc`text-white text-2xl mr-2`}>
                {(stats.distance / 1000).toFixed(2)}
              </CustomText>
              <CustomText style={twrnc`text-gray-300 text-sm`}>km</CustomText>
            </View>
            <View style={twrnc`flex-row items-center mb-2`}>
              <CustomText weight="bold" style={twrnc`text-white text-lg mr-2`}>
                {stats.avgSpeed.toFixed(1)}
              </CustomText>
              <CustomText style={twrnc`text-gray-300 text-sm`}>km/h</CustomText>
            </View>
            <View style={twrnc`flex-row items-center`}>
              <CustomText weight="bold" style={twrnc`text-white text-lg mr-2`}>
                {formatDuration(stats.duration)}
              </CustomText>
              <CustomText style={twrnc`text-gray-300 text-sm`}>time</CustomText>
            </View>
          </View>

          {/* Close fullscreen button */}
          <TouchableOpacity
            onPress={toggleMapView}
            style={twrnc`absolute top-24 right-4 bg-black bg-opacity-70 rounded-full p-3 z-40`}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>

          {/* Control buttons at bottom */}
          {(isActivityTracking || isActivityPaused) && (
            <View style={twrnc`absolute bottom-8 left-0 right-0 flex-row items-center justify-center gap-6 z-40`}>
              <TouchableOpacity
                style={[
                  twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl ${isAndroid ? "elevation-8" : ""}`,
                  { backgroundColor: isPaused ? "#10B981" : "#FFC107" },
                ]}
                onPress={togglePause}
              >
                <Ionicons name={isPaused ? "play" : "pause"} size={28} color="white" />
              </TouchableOpacity>

              {isActivityPaused && (
                <TouchableOpacity
                  style={[
                    twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl ${isAndroid ? "elevation-8" : ""}`,
                    { backgroundColor: "#EF476F" },
                  ]}
                  onPress={() => stopTracking()}
                >
                  <Ionicons name="stop" size={28} color="white" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {isActivityEnded && (
            <View style={twrnc`absolute bottom-8 left-0 right-0 flex-row items-center justify-center gap-4 px-6 z-40`}>
              <TouchableOpacity
                style={twrnc`flex-1 bg-emerald-600 py-4 rounded-2xl items-center justify-center shadow-xl`}
                onPress={saveActivity}
                disabled={isTrackingLoading}
              >
                {isTrackingLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="white" />
                    <CustomText weight="bold" style={twrnc`text-white text-sm mt-1`}>
                      Save
                    </CustomText>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={twrnc`flex-1 bg-red-600 py-4 rounded-2xl items-center justify-center shadow-xl`}
                onPress={handleDiscard}
                disabled={isTrackingLoading}
              >
                <Ionicons name="trash" size={24} color="white" />
                <CustomText weight="bold" style={twrnc`text-white text-sm mt-1`}>
                  Discard
                </CustomText>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Stats Panel (Slide Up Drawer) */}
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
          {/* 1. Drawer Handle (Visual Indicator) */}
          <View style={twrnc`w-12 h-1.5 bg-gray-700/50 rounded-full self-center mt-3 mb-2`} />

          {/* 2. Quest Banner (Floating style, integrated into flow) */}
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

                      {/* Progress Bar (Compact) */}
                      {selectedQuest.category !== 'challenge' && (
                        <View style={twrnc`flex-row items-center mt-1`}>
                          <View style={twrnc`flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden mr-2`}>
                            <View style={[
                              twrnc`h-full rounded-full bg-white`,
                              { width: `${Math.min(getDisplayQuestProgress(selectedQuest) * 100, 100)}%` }
                            ]} />
                          </View>
                          <CustomText style={twrnc`text-white/90 text-[10px] font-mono`}>
                            {Math.round(getDisplayQuestProgress(selectedQuest) * 100)}%
                          </CustomText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Close Button */}
                  <TouchableOpacity
                    onPress={() => setSelectedQuest(null)}
                    style={twrnc`bg-black/10 p-1.5 rounded-full ml-2`}
                  >
                    <FontAwesome name="times" size={10} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {/* 3. Stats Grid - Modern 2x2 Layout */}
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

          {/* 4. Controls Section (Integrated Flow - No Absolute Positioning) */}
          <View style={twrnc`px-6 flex-row items-center justify-center gap-6`}>

            {/* START BUTTON (When Idle) */}
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

            {/* ACTIVE CONTROLS (Pause/Resume/Stop) */}
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

            {/* ENDED CONTROLS (Save/Discard) */}
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
                      <CustomText weight="bold" style={twrnc`text-white`}>Save Activity</CustomText>
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

          {/* Fullscreen Toggle (Top Right) */}
          <TouchableOpacity
            style={twrnc`absolute top-4 right-5 bg-[#1e293b] p-2 rounded-full border border-white/10`}
            onPress={toggleMapView}
          >
            <Ionicons name="expand-outline" size={18} color="white" />
          </TouchableOpacity>

          {/* Overlays (Loading/Error) - Kept relative to this container */}
          {loading && (
            <View style={twrnc`absolute inset-0 bg-[#0f172a]/95 items-center justify-center z-50 rounded-t-3xl`}>
              <ActivityIndicator size="large" color="#FFC107" />
              <CustomText style={twrnc`text-white mt-4`}>Acquiring GPS...</CustomText>
            </View>
          )}

        </Animated.View>
      )}

    </View>
  )
}

export default MapScreen
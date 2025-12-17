"use client"
import { useState, useEffect, useRef } from "react"
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
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from "react-native-maps"
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
import { XPManager } from "../utils/xpManager" // adjust path if different

import { generateRoute } from "../utils/routeGenerator"

// NEW: Import PanGestureHandler and State from react-native-gesture-handler
import { PanGestureHandler, State } from "react-native-gesture-handler"
import { LinearGradient } from "expo-linear-gradient"

import { QuestProgressManager } from "../utils/QuestProgressManager"

const { width, height } = Dimensions.get("window")
const isAndroid = Platform.OS === "android"
const isSmallDevice = width < 375

const MINIMUM_DISTANCE_THRESHOLDS = { walking: 2, jogging: 3, running: 5, cycling: 8 }

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
    initialStats = { distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0 },
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
  // Updated modalContent to include type, icon, and buttons
  const [modalContent, setModalContent] = useState({
    title: "",
    message: "",
    onConfirm: null,
    type: "info",
    icon: null,
    buttons: [],
  })
  // New state for pause functionality
  const [isPaused, setIsPaused] = useState(false)

  // Simplified quest and user state (quest comes from Dashboard)
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [userStats, setUserStats] = useState({
    // Corrected to useState
    level: 1,
    totalXP: 0,
  })
  console.log("MapScreen: Current selectedQuest state:", selectedQuest)

  // NEW: Hold to End animation values
  const holdProgressAnim = useRef(new Animated.Value(0)).current // 0 to 1 for progress
  const HOLD_DURATION = 2000

  const pan = useRef(new Animated.ValueXY({ x: width - 100, y: 16 })).current
  const recentPacesRef = useRef([])
  const paceWindowSizeRef = useRef(PACE_WINDOW_SIZES[activityType] || 5)

  // Animation refs
  const buttonScaleAnim = useRef(new Animated.Value(1)).current // Main button scale
  const saveButtonScaleAnim = useRef(new Animated.Value(1)).current // Save button scale
  const discardButtonScaleAnim = useRef(new Animated.Value(1)).current // Discard button scale
  const iconPulseAnim = useRef(new Animated.Value(1)).current
  const iconMoveAnim = useRef(new Animated.Value(0)).current
  const spinAnim = useRef(new Animated.Value(0)).current // Changed initial value to 0 for spin
  const fadeAnim = useRef(new Animated.Value(1)).current // Set to 1 for no fade-in
  const questPulseAnim = useRef(new Animated.Value(1)).current
  // New animation values for Save/Discard buttons
  const saveDiscardFadeAnim = useRef(new Animated.Value(0)).current
  const saveDiscardSlideAnim = useRef(new Animated.Value(0)).current
  // NEW: Satellite pulse animation for loading state
  const satellitePulseAnim = useRef(new Animated.Value(1)).current

  // NEW: Map style state
  const [currentMapStyleIndex, setCurrentMapStyleIndex] = useState(0)
  // NEW: State for map style dropdown visibility
  const [showMapStylePicker, setShowMapStylePicker] = useState(false)

  const { sessionStart: sessionStartParam } = params || {}
  const sessionStartRef = useRef(sessionStartParam || null)

  // Refs
  const mapRef = useRef(null)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const lastUpdateTimeRef = useRef(Date.now())
  const lowAccuracyCountRef = useRef(0)
  const rawCoordinatesRef = useRef([])
  const locationWatchRef = useRef(null)
  const lastCoordinateRef = useRef(null)
  const holdTimerRef = useRef(null)
  const coordinatesRef = useRef([])

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
    jogging: { icon: "running", color: "rgb(255, 193, 7)", strokeColor: "rgb(255, 193, 7)", darkColor: "#E6BC5C" }, // Corrected jogging color
  }
  const currentActivity = activityConfigs[activityType] || activityConfigs.walking
  const maxSpeed = activityType === "cycling" ? 20 : 8

  // Create pan responder for draggable GPS indicator
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

  // Load user stats from Firestore (simplified version)
  const loadUserStats = async () => {
    try {
      const user = auth.currentUser
      if (!user) {
        console.log("MapScreen: No user found for loading stats")
        return
      }
      console.log("MapScreen: Loading user stats for user:", user.uid)
      const userRef = doc(db, "users", user.uid)
      const userDoc = await getDoc(userRef)
      if (userDoc.exists()) {
        const userData = userDoc.data()
        console.log("MapScreen: Loaded user data:", userData)
        setUserStats({
          level: userData.level || 1,
          totalXP: userData.totalXP || 0,
        })
      } else {
        console.log("MapScreen: User document does not exist, using defaults")
      }
    } catch (error) {
      console.error("MapScreen: Error loading user stats:", error)
    }
  }

  useEffect(() => {
    console.log("MapScreen: Processing params for quest initialization:", params)
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
      }

      console.log("MapScreen: Setting selected quest from params:", questData)
      setSelectedQuest(questData)
    } else if (activeQuest) {
      console.log("MapScreen: Setting selected quest from activeQuest param:", activeQuest)
      setSelectedQuest(activeQuest)
    } else {
      console.log("MapScreen: No quest data found in params")
      setSelectedQuest(null)
    }
  }, [params, activeQuest])

  // Load user stats on component mount
  useEffect(() => {
    loadUserStats()
  }, [])

  // Start quest pulse animation when quest is selected
  useEffect(() => {
    if (selectedQuest) {
      console.log("MapScreen: Starting pulse animation for selected quest")
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

  // Add this useEffect to validate quest compatibility
  useEffect(() => {
    if (selectedQuest && selectedQuest.activityType !== activityType) {
      console.warn(
        `MapScreen: Quest activity type (${selectedQuest.activityType}) doesn't match current activity (${activityType})`,
      )

      // Show warning but don't block the activity
      showModal(
        "Quest Mismatch",
        `This quest is for ${selectedQuest.activityType}, but you're doing ${activityType}. Progress may not be tracked correctly.`,
        null,
        "warning",
        "exclamation-triangle",
      )
    }
  }, [selectedQuest, activityType])

  const getDisplayQuestProgress = (quest) => {
    if (!quest) return 0
    // Convert stats.distance from meters to km for QuestProgressManager
    const questStats = {
      ...stats,
      distance: stats.distance / 1000, 
    }
    return QuestProgressManager.getProgressPercentage(quest, questStats, 0)
  }

  const getQuestStatus = (quest) => {
    if (!quest) return "not_started"
    // Convert stats.distance from meters to km for QuestProgressManager
    const questStats = {
      ...stats,
      distance: stats.distance / 1000, // convert meters to km
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

  // Set initial position for the pan animation
  useEffect(() => {
    pan.setValue({ x: gpsIndicatorPosition.x, y: gpsIndicatorPosition.y })
  }, [])

  // Initialize activity thresholds based on type
  useEffect(() => {
    setDistanceThreshold(MINIMUM_DISTANCE_THRESHOLDS[activityType] || 1.5)
    paceWindowSizeRef.current = PACE_WINDOW_SIZES[activityType] || 5
    recentPacesRef.current = []
    setSmoothedPace(0)
  }, [activityType])

  // Function to clear the suggested route
  const clearSuggestedRoute = () => {
    setSuggestedRoute(null)
    setShowSuggestedRoute(false)
    setFollowingSuggestedRoute(false)
    if (mapRef.current && currentLocation) {
      mapRef.current.animateToRegion(
        {
          ...currentLocation,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000,
      )
    }
  }

  // Generic button press in/out animations
  const handleButtonPressIn = (scaleAnim) => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start()
  }

  const handleButtonPressOut = (scaleAnim) => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5, // Add some friction for a springy effect
      useNativeDriver: true,
    }).start()
  }

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

  // Start satellite pulse animation for loading state
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
    // No slide animations, just ensure fadeAnim is set to 1
    fadeAnim.setValue(1)
  }

  const animateTrackingTransition = (isStarting) => {
    // No slide animations
  }

  const animateSaveDiscardIn = () => {
    saveDiscardFadeAnim.setValue(0)
    saveDiscardSlideAnim.setValue(0) // No slide
    Animated.parallel([
      Animated.timing(saveDiscardFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(saveDiscardSlideAnim, {
        toValue: 0, // No slide
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
        toValue: 0, // No slide
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
      animateTrackingTransition(true)
    } else if (!isTrackingLoading) {
      startIconMoveAnimation()
      if (coordinates.length > 0) {
        animateTrackingTransition(false)
      }
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

  // Effect to manage Save/Discard button visibility
  useEffect(() => {
    const activityEnded = !tracking && !isPaused && coordinates.length > 0
    if (activityEnded) {
      animateSaveDiscardIn()
    } else {
      animateSaveDiscardOut()
    }
  }, [tracking, isPaused, coordinates.length])

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  })

  const returnToActivity = (finalStats = null, options = {}) => {
    const safeFinalStats = finalStats || stats
    navigateToActivity({
      activityType,
      coordinates: [],
      stats: safeFinalStats,
      isViewingPastActivity: true,
      alreadySaved: options.alreadySaved === true,
      ...(selectedQuest && {
        questId: selectedQuest.id,
        title: selectedQuest.title,
        description: selectedQuest.description,
        goal: selectedQuest.goal,
        unit: selectedQuest.unit,
        progress: selectedQuest.progress,
        status: selectedQuest.status,
        xpReward: selectedQuest.xpReward,
        difficulty: selectedQuest.difficulty,
        category: selectedQuest.category,
      }),
    })
  }

  const centerMap = () => {
    if (mapRef.current && currentLocation) {
      mapRef.current.animateToRegion(
        {
          ...currentLocation,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000,
      )
    }
  }

  // Updated showModal to accept type, icon, and a 'buttons' array for custom actions
  const showModal = (title, message, options = {}, type = "info", icon = null, buttons = []) => {
    // Handle null/undefined options
    if (options === null || options === undefined) {
      options = {}
    }

    // Handle both function and object syntax
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

  const calculateMetrics = (distance, duration) => {
    const numDistance = ensureNumeric(distance)
    const numDuration = ensureNumeric(duration)
    if (numDistance < 5 || numDuration < 5) {
      return { pace: 0, avgSpeed: 0 }
    }
    const rawPace = calculatePace(numDistance, numDuration)
    const smoothedPaceValue = calculateMovingAveragePace(rawPace)
    setSmoothedPace(smoothedPaceValue)
    const avgSpeed = numDistance / 1000 / (numDuration / 3600)
    return { pace: smoothedPaceValue, rawPace, avgSpeed }
  }

  // Updated backAction to use the new modal button structure
  const backAction = () => {
    if (tracking || isPaused) {
      showModal(
        "Exit Activity",
        "What would you like to do with your current activity?",
        null, // No default onConfirm, as we're using custom buttons
        "info", // Type for info icon
        "question-circle", // Specific icon
        [
          {
            label: "Save",
            action: () => {
              saveActivity()
              return true // This action will close the modal
            },
            style: "primary",
          },
          {
            label: "Discard",
            action: () => {
              // Call handleDiscard, which will show its own confirmation modal
              handleDiscard()
              return false // IMPORTANT: Return false to prevent this modal from closing immediately
            },
            style: "danger",
          },
          {
            label: "Continue",
            action: () => {
              // Just close the modal, activity state remains as is (tracking or paused)
              return true // This action will close the modal
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
  }, [tracking, isPaused, coordinates.length]) // Added coordinates.length to dependency array

  // Initialize location tracking
  useEffect(() => {
    const initialize = async () => {
      try {
        const hasPermission = await requestPermissions()
        if (!hasPermission) {
          setError("Location permissions are required to use this feature.")
          return
        }
        // Set a default region if currentLocation is not yet available
        if (!currentLocation) {
          setCurrentLocation({
            latitude: 37.78825, // Default coordinates (e.g., San Francisco)
            longitude: -122.4324,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          })
        }
        await startLocationUpdates()
        await startTracking() // Start tracking immediately
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
      // Stop any existing watcher
      if (locationWatchRef.current) {
        try {
          await locationWatchRef.current.remove?.()
        } catch { }
        locationWatchRef.current = null
        console.log("MapScreen: Existing location watch removed before starting new one")
      }

      // Get an initial fix to center map
      const location = await Location.getCurrentPositionAsync({
        accuracy: locationAccuracy, // e.g., Location.Accuracy.BestForNavigation
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

      // Start watching position with 1 Hz and 5 m step
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (loc) => {
          const { latitude, longitude, accuracy, speed } = loc.coords

          // GPS signal indicator
          if (accuracy > 50) setGpsSignal("Poor")
          else if (accuracy > 30) setGpsSignal("Fair")
          else if (accuracy > 15) setGpsSignal("Good")
          else setGpsSignal("Excellent")

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

  const startTracking = async () => {
    console.log("MapScreen: Starting tracking")
    setIsTrackingLoading(true)

    // Capture session start timestamp once for deterministic IDs/XP
    if (!sessionStartRef.current) {
      sessionStartRef.current = Date.now()
    }

    try {
      // Permissions
      const hasPermission = await requestPermissions()
      if (!hasPermission) {
        setError("Location permissions not granted.")
        setIsTrackingLoading(false)
        return
      }

      // Ensure single watcher by stopping any existing one
      if (locationWatchRef.current) {
        try {
          await locationWatchRef.current.remove?.()
        } catch { }
        locationWatchRef.current = null
        console.log("MapScreen: Existing location watch removed before tracking")
      }

      // Determine initial location
      let initialLocation
      if (currentLocation) {
        initialLocation = {
          coords: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: 10,
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

      const initialCoord = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        timestamp: initialLocation.timestamp,
        accuracy: initialLocation.coords.accuracy,
        speed: 0,
      }

      // Fresh start vs resume
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
        })
        console.log("MapScreen: Starting new tracking session with reset stats")
      } else {
        // Resume
        lastCoordinateRef.current = coordinates[coordinates.length - 1] || initialCoord
        startTimeRef.current = new Date(Date.now() - stats.duration * 1000)
        console.log("MapScreen: Resuming tracking session")
      }

      setTracking(true)
      setIsPaused(false)
      setFollowingSuggestedRoute(followingSuggestedRoute)

      console.log("MapScreen: Initial coordinate set:", initialCoord)
      console.log(`MapScreen: Pace window size: ${paceWindowSizeRef.current} for ${activityType}`)

      // Duration ticker (1 Hz)
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        setStats((prev) => {
          const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
          const distanceKm = (prev.distance || 0) / 1000
          const avgSpeed = distanceKm > 0 && duration > 0 ? distanceKm / (duration / 3600) : 0 // km/h
          const rawPace = distanceKm > 0 ? duration / 60 / distanceKm : 0 // min/km
          const smoothed = calculateMovingAveragePace(rawPace || 0)
          setSmoothedPace(smoothed)
          return { ...prev, duration, avgSpeed, rawPace, pace: smoothed }
        })
      }, 1000)

      // Start GPS watcher for distance and live stats
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (loc) => {
          if (isPaused) return

          const { latitude, longitude, accuracy, speed = 0, altitude = 0 } = loc.coords

          // Gate bad fixes
          if (accuracy > 50 || speed > maxSpeed) {
            lowAccuracyCountRef.current += 1
            if (lowAccuracyCountRef.current >= 5) setGpsSignal("Poor")
            console.log(
              `MapScreen: Skipping location due to poor accuracy (${accuracy?.toFixed?.(1)}m) or high speed (${speed?.toFixed?.(1)} m/s)`,
            )
            return
          }

          // Reset counter on good fix and set signal
          lowAccuracyCountRef.current = 0
          if (accuracy <= 15) setGpsSignal("Excellent")
          else if (accuracy <= 30) setGpsSignal("Good")
          else if (accuracy <= 50) setGpsSignal("Fair")
          else setGpsSignal("Poor")

          const smoothedCoordinate = {
            latitude: Number.parseFloat(latitude.toFixed(6)),
            longitude: Number.parseFloat(longitude.toFixed(6)),
            timestamp: Date.now(),
            accuracy: Number.parseFloat(accuracy.toFixed(1)),
            speed: Number.parseFloat(speed.toFixed(2)),
            altitude: Number.parseFloat(altitude.toFixed(1)),
          }

          const lastCoord = lastCoordinateRef.current
          if (lastCoord) {
            const nowMs = smoothedCoordinate.timestamp
            const lastMs = lastUpdateTimeRef.current || nowMs
            const dt = Math.max(0, (nowMs - lastMs) / 1000)
            lastUpdateTimeRef.current = nowMs

            const dHav = calculateDistance(
              lastCoord.latitude,
              lastCoord.longitude,
              smoothedCoordinate.latitude,
              smoothedCoordinate.longitude,
            ) // meters

            const distanceIncrement = dHav >= distanceThreshold ? dHav : 0
            if (distanceIncrement === 0 && dHav > 0) {
              console.log(`MapScreen: Filtered small move (${dHav.toFixed(2)}m < ${distanceThreshold}m)`)
            }

            setStats((prevStats) => {
              const newDistance = (prevStats.distance || 0) + distanceIncrement // meters
              const duration = prevStats.duration || 0 // seconds

              const distanceKm = newDistance / 1000
              const avgSpeed = duration > 0 && distanceKm > 0 ? distanceKm / (duration / 3600) : prevStats.avgSpeed || 0
              const rawPace = distanceKm > 0 ? duration / 60 / distanceKm : 0
              const smoothed = calculateMovingAveragePace(rawPace || 0)
              setSmoothedPace(smoothed)

              return {
                ...prevStats,
                distance: newDistance,
                avgSpeed,
                rawPace,
                pace: smoothed,
              }
            })
          } else {
            console.log("MapScreen: No previous coordinate for distance calc; initializing lastCoord")
          }

          setCoordinates((prev) => [...prev, smoothedCoordinate])
          lastCoordinateRef.current = smoothedCoordinate
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

  const smoothCoordinate = (previousCoordinates, newCoordinate) => {
    if (previousCoordinates.length < 2) return newCoordinate

    let totalWeight = 0
    let weightedLat = 0
    let weightedLng = 0

    previousCoordinates.forEach((coord, index) => {
      const weight = (index + 1) / (coord.accuracy || 20)
      totalWeight += weight
      weightedLat += coord.latitude * weight
      weightedLng += coord.longitude * weight
    })

    const currentWeight = previousCoordinates.length / (newCoordinate.accuracy || 20)
    totalWeight += currentWeight
    weightedLat += newCoordinate.latitude * currentWeight
    weightedLng += newCoordinate.longitude * currentWeight

    return {
      ...newCoordinate,
      latitude: weightedLat / totalWeight,
      longitude: weightedLng / totalWeight,
    }
  }

  // NEW: Function to handle pause/resume toggle
  const togglePause = () => {
    if (tracking) {
      // If currently tracking, pause it
      stopTracking() // This will set tracking to false
      setIsPaused(true) // Explicitly set paused state
      console.log("MapScreen: Activity Paused")
      showModal(
        "Activity Paused",
        "Your activity has been paused. Tap 'Resume' to continue.",
        null,
        "info",
        "pause-circle",
      )
    } else if (isPaused) {
      // If currently paused, resume it
      startTracking() // This will set tracking to true and isPaused to false
      console.log("MapScreen: Activity Resumed")
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
      setIsPaused(false) // Explicitly reset isPaused to false to indicate activity has fully ended
      setFollowingSuggestedRoute(false)
      Vibration.vibrate(200) // Haptic feedback for stop
      await startLocationUpdates() // Keep GPS active for current location display
    } catch (err) {
      console.error("MapScreen: Stop tracking error:", err)
      setError("Failed to stop tracking.")
    } finally {
      setIsTrackingLoading(false)
    }
  }

  // In MapScreen.js, add function to reset quest progress when activity is cleared
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
            console.log("MapScreen: Discarding activity and resetting session progress")
            setCoordinates([])
            setStats({ distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0 })
            setIsPaused(false)
            setTracking(false)

            // Reset session but preserve baseline progress
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

  const stopTrackingCleanly = async () => {
    try {
      if (locationWatchRef.current) {
        try {
          await locationWatchRef.current.remove?.()
        } catch { }
        locationWatchRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    } catch { }
    lastCoordinateRef.current = null
    lastUpdateTimeRef.current = null
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
        calories: ensureNumeric(stats.calories),
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

      // Determine quest source and challenge ID if applicable
      const questSource = activeChallenge ? "challenge" : "dashboard";
      const challengeId = activeChallenge ? activeChallenge.id : null;

      // Deterministic ID and XP award
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
          calories: ensureNumeric(stats.calories),
        },
        selectedQuest: activeQuest || null,
        activityType,
        isStrengthActivity: false,
        questSource,
        challengeId,
      });

      // Persist with per-activity XP, quest source, and challenge ID
      await setDoc(
        doc(db, "activities", activityId),
        {
          ...activityData,
          xpEarned: xpResult.xpEarned || 0,
          bonusXP: xpResult.bonusXP || 0,
          questCompleted: !!xpResult.questCompleted,
          questSource,
          challengeId,
        },
        { merge: true }
      );

      const successMessage =
        `Great ${activityType} session!\n\n` +
        `• ${formatDistance(stats.distance)} covered\n` +
        `• ${formatDuration(stats.duration)} duration\n` +
        `• ${formatSpeedKmh(stats.avgSpeed)} avg speed\n` +
        `• ${stats.steps?.toLocaleString() || 0} steps\n` +
        `• ${stats.calories || 0} calories burned` +
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
        "success", // type
        "check-circle", // icon
        [] // buttons
      );
    } catch (error) {
      console.error("MapScreen saveActivity error:", error);
      showModal("Error", "Failed to save activity. Please try again.");
    } finally {
      setIsTrackingLoading(false);
    }
  };

  console.log("MapScreen: Rendering with selectedQuest:", selectedQuest)

  // Determine current activity state for button logic
  const isActivityIdle = !tracking && !isPaused && coordinates.length === 0
  const isActivityTracking = tracking
  const isActivityPaused = !tracking && isPaused
  const isActivityEnded = !tracking && !isPaused && coordinates.length > 0

  // NEW: PanGestureHandler for "Tap and Hold to End"
  const onHoldGestureEvent = Animated.event(
    [{ nativeEvent: { absoluteX: holdProgressAnim } }], // This is a dummy, actual progress is time-based
    { useNativeDriver: false },
  )

  const onHoldHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === State.BEGAN) {
      console.log("Hold started")
      Vibration.vibrate(50) // Haptic feedback for start of hold
      holdTimerRef.current = setTimeout(() => {
        // If timer completes, it means hold was successful
        console.log("Hold successful, ending activity")
        Vibration.vibrate(200) // Stronger haptic for successful hold
        stopTracking() // Stop tracking first
        // saveActivity() will be called when isActivityEnded becomes true
      }, HOLD_DURATION)

      Animated.timing(holdProgressAnim, {
        toValue: 1, // Animate to 100%
        duration: HOLD_DURATION, // Use the same HOLD_DURATION here
        easing: Easing.linear,
        useNativeDriver: false,
      }).start()
    } else if (
      nativeEvent.state === State.END ||
      nativeEvent.state === State.CANCELLED ||
      nativeEvent.state === State.FAILED
    ) {
      console.log("Hold ended or cancelled")
      Vibration.vibrate(50) // Haptic feedback for end/cancel of hold
      clearTimeout(holdTimerRef.current)
      Animated.timing(holdProgressAnim, {
        toValue: 0, // Reset progress
        duration: 200,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start()
    }
  }

  // NEW: Function to open the map style picker modal
  const openMapStylePicker = () => {
    setShowMapStylePicker(true)
  }

  // NEW: Function to handle map style selection from the modal
  const handleMapStyleSelect = (index) => {
    setCurrentMapStyleIndex(index)
    setShowMapStylePicker(false) // Close the modal after selection
  }

  const currentMapStyle = MAP_STYLES[currentMapStyleIndex]

  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const mapToggleAnim = useRef(new Animated.Value(0)).current // 0 = stats view, 1 = fullscreen map

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

  // Main component render
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

      <Animated.View
        style={[
          twrnc`absolute inset-0`,
          {
            transform: [
              {
                translateY: mapToggleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height * 0.6, 0], // Map starts 60% down, slides to full screen
                }),
              },
            ],
          },
        ]}
      >
        <MapView
          ref={mapRef}
          style={twrnc`flex-1`}
          provider={PROVIDER_GOOGLE}
          initialRegion={currentLocation}
          showsUserLocation={true}
          showsMyLocationButton={false}
          loadingEnabled={true}
          moveOnMarkerPress={false}
          toolbarEnabled={false}
          mapType={currentMapStyle.mapType}
          customMapStyle={currentMapStyle.style}
        >
          {/* ... existing map markers and polylines ... */}
          {!tracking && currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
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
            </Marker>
          )}

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

        {isMapFullscreen && (
          <>
            {/* Top-left stats overlay in fullscreen mode */}
            <View style={twrnc`absolute top-16 left-4 bg-black bg-opacity-70 rounded-2xl p-4`}>
              <View style={twrnc`flex-row items-center mb-2`}>
                <CustomText weight="bold" style={twrnc`text-white text-2xl mr-2`}>
                  {(stats.distance / 1000).toFixed(2)}
                </CustomText>
                <CustomText style={twrnc`text-gray-300 text-sm`}>km</CustomText>
              </View>
              <View style={twrnc`flex-row items-center`}>
                <CustomText weight="bold" style={twrnc`text-white text-lg mr-2`}>
                  {stats.avgSpeed.toFixed(1)}
                </CustomText>
                <CustomText style={twrnc`text-gray-300 text-sm`}>km/h</CustomText>
              </View>
            </View>

            {/* Back button in fullscreen mode */}
            <TouchableOpacity
              onPress={toggleMapView}
              style={twrnc`absolute top-16 right-4 bg-black bg-opacity-70 rounded-full p-3`}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </>
        )}
      </Animated.View>

      {!isMapFullscreen && (
        <View style={twrnc`flex-1 bg-black`}>
          {selectedQuest && (
            <Animated.View
              style={{
                position: "absolute",
                top: 80,
                left: 16,
                right: 16,
                opacity: fadeAnim,
                transform: [{ scale: questPulseAnim }],
                zIndex: 15,
              }}
            >
              <LinearGradient
                colors={[
                  getQuestStatus(selectedQuest) === "completed" ? "#10B981" : "#FFC107",
                  getQuestStatus(selectedQuest) === "completed" ? "#059669" : "#d39e01ff",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={twrnc`p-4 rounded-2xl shadow-2xl ${isAndroid ? "elevation-8" : ""}`}
              >
                <View style={twrnc`flex-row items-center justify-between mb-3`}>
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`bg-white bg-opacity-25 rounded-full p-2.5 mr-3 shadow-sm`}>
                      <FontAwesome
                        name={getQuestStatus(selectedQuest) === "completed" ? "trophy" : "bullseye"}
                        size={16}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={twrnc`flex-1`}>
                      <CustomText weight="bold" style={twrnc`text-white text-base mb-1`}>
                        {selectedQuest.title}
                      </CustomText>
                      <CustomText style={twrnc`text-white text-opacity-85 text-xs leading-relaxed`}>
                        {selectedQuest.description}
                      </CustomText>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedQuest(null)}
                    style={twrnc`bg-white bg-opacity-20 p-2 rounded-full shadow-sm`}
                  >
                    <FontAwesome name="times" size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <View style={twrnc`mb-2`}>
                  <View style={twrnc`flex-row justify-between items-center mb-2`}>
                    <CustomText style={twrnc`text-white text-opacity-90 text-xs font-medium`}>Progress</CustomText>
                    <View style={twrnc`flex-row items-center`}>
                      <CustomText weight="bold" style={twrnc`text-white text-sm mr-2`}>
                        {Math.round(getDisplayQuestProgress(selectedQuest) * 100)}%
                      </CustomText>
                      <CustomText style={twrnc`text-white text-opacity-75 text-xs`}>
                        {QuestProgressManager.getProgressDisplayText(
                          selectedQuest,
                          {
                            ...stats,
                            distance: stats.distance / 1000, // convert meters to km
                          },
                          0,
                        )}
                      </CustomText>
                    </View>
                  </View>
                  <View style={twrnc`h-2 bg-white bg-opacity-20 rounded-full overflow-hidden shadow-inner`}>
                    <View
                      style={[
                        twrnc`h-2 rounded-full shadow-sm`,
                        {
                          width: `${Math.min(getDisplayQuestProgress(selectedQuest) * 100, 100)}%`,
                          backgroundColor: getDisplayQuestProgress(selectedQuest) >= 1 ? "#FFFFFF" : "#FDE68A",
                        },
                      ]}
                    />
                  </View>
                </View>

                {getQuestStatus(selectedQuest) === "completed" && (
                  <View
                    style={twrnc`flex-row items-center justify-center mt-2 bg-white bg-opacity-20 rounded-full py-1.5 px-3`}
                  >
                    <FontAwesome name="check-circle" size={14} color="#FFFFFF" />
                    <CustomText style={twrnc`text-white text-xs font-semibold ml-2`}>
                      Quest Completed! +{selectedQuest.xpReward || 50} XP
                    </CustomText>
                  </View>
                )}
              </LinearGradient>
            </Animated.View>
          )}

          {/* Header Section - Elapsed Time */}
          <View style={twrnc`pt-${selectedQuest ? "32" : "16"} pb-8 px-6 items-center`}>
            <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>Time</CustomText>
            <CustomText weight="bold" style={twrnc`text-white text-6xl font-mono`}>
              {formatDuration(stats.duration)}
            </CustomText>
          </View>

          <View style={twrnc`px-6 py-8 items-center`}>
            <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>Distance</CustomText>
            <CustomText weight="bold" style={twrnc`text-white text-5xl`}>
              {formatDistance(stats.distance)}
            </CustomText>
          </View>

          {/* Duration Section */}
          <View style={twrnc`px-6 py-8 items-center border-l border-r border-gray-600`}>
            <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>Duration</CustomText>
            <CustomText weight="bold" style={twrnc`text-white text-5xl`}>
              {formatDuration(stats.duration)}
            </CustomText>
          </View>

          {/* Middle Section - Average Pace / Current Speed */}
          <View style={twrnc`px-6 py-8 items-center`}>
            <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>
              {activityType === "cycling" ? "Speed" : "Avg Pace"}
            </CustomText>
            <CustomText weight="bold" style={twrnc`text-white text-5xl`}>
              {activityType === "cycling" ? formatSpeedKmh(stats.avgSpeed) : formatPacePerKm(stats.pace)}
            </CustomText>
          </View>

          {/* Bottom Section - Distance and Pace Chart */}
          <View style={twrnc`flex-1 px-6 pb-32`}>
            <View style={twrnc`flex-row justify-between items-end`}>
              {/* Left: Pace Split Chart (simplified) */}
              <View style={twrnc`flex-1 mr-4`}>
                <CustomText style={twrnc`text-gray-400 text-sm mb-4`}>Pace Splits</CustomText>
                <View style={twrnc`flex-row items-end h-20`}>
                  {/* Simple bar chart representation */}
                  {[0.8, 1.0, 0.9, 1.1, 0.7].map((height, index) => (
                    <View key={index} style={[twrnc`bg-[#FFC107] rounded-t-sm mr-1 flex-1`, { height: height * 60 }]} />
                  ))}
                </View>
              </View>

              {/* Right: Distance */}
              {/* <View style={twrnc`items-end`}>
                <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>Distance</CustomText>
                <CustomText weight="bold" style={twrnc`text-white text-4xl`}>
                  {(stats.distance / 1000).toFixed(2)}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-lg`}>km</CustomText>
              </View> */}
            </View>
          </View>
        </View>
        // FFC107
      )}

      {/* Enhanced Loading State with Satellite Animation */}
      {loading && (
        <View
          style={twrnc`absolute top-0 left-0 right-0 bottom-0 justify-center items-center z-20 bg-black bg-opacity-90`}
        >
          <Animated.View style={{ transform: [{ scale: satellitePulseAnim }] }}>
            <View style={twrnc`p-8 rounded-full border border-orange-500 border-opacity-30`}>
              <FontAwesome name="satellite" size={56} color="#FFC107" />
            </View>
          </Animated.View>
          <CustomText style={twrnc`text-white mt-6 text-lg font-medium`}>Acquiring GPS Signal...</CustomText>
        </View>
      )}

      {/* Enhanced Error State */}
      {error && (
        <View
          style={twrnc`absolute top-0 left-0 right-0 bottom-0 justify-center items-center p-6 z-20 bg-black bg-opacity-90`}
        >
          <View style={twrnc`bg-red-500 bg-opacity-20 p-4 rounded-full mb-6`}>
            <FontAwesome name="exclamation-circle" size={56} color="#FFC107" />
          </View>
          <CustomText style={twrnc`text-white text-center mb-6 text-lg leading-relaxed`}>{error}</CustomText>
          <TouchableOpacity
            style={twrnc`px-8 py-4 rounded-2xl bg-orange-500`}
            activeOpacity={0.7}
            onPress={() => {
              setError(null)
              startLocationUpdates()
            }}
          >
            <CustomText style={twrnc`text-white text-lg font-semibold`}>Try Again</CustomText>
          </TouchableOpacity>
        </View>
      )}

      <View style={twrnc`absolute bottom-8 left-0 right-0 px-6 z-30`}>
        <View style={twrnc`flex-row justify-between items-center`}>
          {/* Large round Start/Pause/Stop button - bottom center */}
          <View style={twrnc`flex-1 items-center`}>
            {isActivityIdle && (
              <TouchableOpacity
                style={[
                  twrnc`w-20 h-20 rounded-full items-center justify-center shadow-2xl`,
                  { backgroundColor: "#FFC107" }, // Orange color
                ]}
                activeOpacity={0.8}
                onPress={() => startTracking()}
                disabled={isTrackingLoading}
              >
                {isTrackingLoading ? (
                  <ActivityIndicator size="large" color="white" />
                ) : (
                  <Ionicons name="play" size={32} color="white" />
                )}
              </TouchableOpacity>
            )}

            {(isActivityTracking || isActivityPaused) && (
              <View style={twrnc`flex-row gap-4`}>
                {/* Pause/Resume Button */}
                <TouchableOpacity
                  style={[
                    twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl`,
                    { backgroundColor: isActivityTracking ? "#FFC107" : "#10B981" },
                  ]}
                  activeOpacity={0.8}
                  onPress={togglePause}
                  disabled={isTrackingLoading}
                >
                  <Ionicons name={isActivityTracking ? "pause" : "play"} size={24} color="white" />
                </TouchableOpacity>

                {/* Stop Button - only when paused */}
                {isActivityPaused && (
                  <PanGestureHandler
                    onGestureEvent={onHoldGestureEvent}
                    onHandlerStateChange={onHoldHandlerStateChange}
                    enabled={isActivityPaused}
                  >
                    <Animated.View
                      style={[
                        twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl relative overflow-hidden`,
                        { backgroundColor: "#EF4444" },
                      ]}
                    >
                      <Animated.View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: "rgba(0,0,0,0.4)",
                          width: holdProgressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0%", "100%"],
                          }),
                        }}
                      />
                      <Ionicons name="stop" size={24} color="white" />
                    </Animated.View>
                  </PanGestureHandler>
                )}
              </View>
            )}

            {isActivityEnded && (
              <View style={twrnc`flex-row gap-4`}>
                <TouchableOpacity
                  style={twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl bg-green-500`}
                  activeOpacity={0.8}
                  onPress={saveActivity}
                  disabled={isTrackingLoading}
                >
                  {isTrackingLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={twrnc`w-16 h-16 rounded-full items-center justify-center shadow-xl bg-red-500`}
                  activeOpacity={0.8}
                  onPress={handleDiscard}
                  disabled={isTrackingLoading}
                >
                  <Ionicons name="trash" size={24} color="white" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Map toggle button - bottom right */}
          {!isMapFullscreen && (
            <TouchableOpacity
              onPress={toggleMapView}
              style={twrnc`w-14 h-14 rounded-full bg-gray-800 bg-opacity-80 items-center justify-center shadow-xl`}
            >
              <Ionicons name="map" size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

export default MapScreen

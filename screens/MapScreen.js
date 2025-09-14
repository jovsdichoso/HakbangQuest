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
import { calculateDistance, formatTime, calculatePace, formatPace } from "../utils/activityUtils"
import { db, auth } from "../firebaseConfig"
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from "firebase/firestore"
import { generateRoute } from "../utils/routeGenerator"

// NEW: Import PanGestureHandler and State from react-native-gesture-handler
import { PanGestureHandler, State } from "react-native-gesture-handler"
import { LinearGradient } from "expo-linear-gradient"

const { width, height } = Dimensions.get("window")
const isAndroid = Platform.OS === "android"
const isSmallDevice = width < 375

const MINIMUM_DISTANCE_THRESHOLDS = {
  walking: 2, // meters
  jogging: 3, // meters
  running: 5, // meters
  cycling: 8, // meters
}

const PACE_WINDOW_SIZES = {
  walking: 5,
  jogging: 5,
  running: 5,
  cycling: 7,
}

// Define map styles
const MAP_STYLES = [
  {
    name: "Hybrid",
    style: [], // Default hybrid style (no custom JSON needed for hybrid)
    mapType: "hybrid",
  },
  {
    name: "Standard",
    style: [], // Default standard style (no custom JSON needed for standard)
    mapType: "standard",
  },
]

const MapScreen = ({ navigateToActivity, navigateToDashboard, params = {} }) => {
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
    userHeight = 170,
  } = params

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

  // Enhanced quest initialization from params (same as ActivityScreen)
  useEffect(() => {
    console.log("MapScreen: Processing params for quest initialization:", params)
    if (params.questId || (params.title && params.description && params.goal && params.unit)) {
      const questData = {
        id: params.questId || `quest_${Date.now()}`,
        title: params.title,
        description: params.description,
        goal: params.goal,
        unit: params.unit,
        progress: params.progress || 0, // Use progress from Dashboard
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
      console.warn(`MapScreen: Quest activity type (${selectedQuest.activityType}) doesn't match current activity (${activityType})`);

      // Show warning but don't block the activity
      showModal(
        "Quest Mismatch",
        `This quest is for ${selectedQuest.activityType}, but you're doing ${activityType}. Progress may not be tracked correctly.`,
        null,
        "warning",
        "exclamation-triangle"
      );
    }
  }, [selectedQuest, activityType]);

  // Updated quest progress calculation to use Dashboard data when available (same as ActivityScreen)
  const getDisplayQuestProgress = (quest) => {
    if (!quest) {
      console.log("MapScreen: No quest provided for progress calculation");
      return 0;
    }

    // Calculate current value based on quest unit
    let currentValue = 0;

    if (quest.unit === "reps") {
      currentValue = stats.reps || 0;
    } else if (quest.unit === "distance" || quest.unit === "km") {
      currentValue = stats.distance / 1000; // meters to km
    } else if (quest.unit === "duration" || quest.unit === "minutes") {
      currentValue = stats.duration / 60; // seconds to minutes
    } else if (quest.unit === "pace") {
      currentValue = stats.pace;
    } else if (quest.unit === "calories") {
      currentValue = stats.calories || 0;
    } else if (quest.unit === "steps") {
      currentValue = stats.steps || 0;
    }

    // For pace quests (lower is better)
    if (quest.unit === "pace") {
      const goalValue = Number.parseFloat(quest.goal || 0);
      if (currentValue <= goalValue && currentValue > 0) {
        return 1; // 100% if pace is better than or equal to goal
      }
      return Math.max(0, 1 - (currentValue - goalValue) / goalValue);
    }

    // For all other quest types (higher is better)
    const goalValue = Number.parseFloat(quest.goal || 1);
    return Math.min(currentValue / goalValue, 1);
  };

  // Replace getCurrentQuestValue function
  const getCurrentQuestValue = (quest) => {
    if (!quest) return 0;

    let currentValue = 0;

    if (quest.unit === "reps") {
      currentValue = stats.reps || 0;
    } else if (quest.unit === "distance" || quest.unit === "km") {
      currentValue = stats.distance / 1000;
    } else if (quest.unit === "duration" || quest.unit === "minutes") {
      currentValue = stats.duration / 60;
    } else if (quest.unit === "pace") {
      currentValue = stats.pace;
    } else if (quest.unit === "calories") {
      currentValue = stats.calories || 0;
    } else if (quest.unit === "steps") {
      currentValue = stats.steps || 0;
    }

    return currentValue;
  };

  const getQuestStatus = (quest) => {
    const progress = getDisplayQuestProgress(quest)
    if (progress >= 1) return "completed"
    if (progress > 0) return "in_progress"
    return "not_started"
  }

  // Function to calculate the moving average for pace
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

  // Function to generate a suggested route
  const handleGenerateRoute = async () => {
    if (!currentLocation) {
      showModal("Error", "Cannot generate route. Current location not available.", null, "error", "map-marker-alt")
      return
    }
    setIsGeneratingRoute(true)
    try {
      const route = await generateRoute(
        { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        Number.parseFloat(targetDistance),
        activityType,
      )
      if (route) {
        setSuggestedRoute(route)
        setShowSuggestedRoute(true)
        if (mapRef.current && route.coordinates.length > 0) {
          mapRef.current.fitToCoordinates(route.coordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          })
        }
        showModal(
          "Route Generated",
          `A ${route.difficulty} ${route.distance} km ${route.routeType || ""} route has been created for ${activityType}. Would you like to follow this route?`,
          () => {
            setFollowingSuggestedRoute(true)
          },
          "info",
          "map-signs",
        )
      } else {
        showModal("Error", "Failed to generate route. Please try again.", null, "error", "exclamation-circle")
      }
    } catch (error) {
      console.error("Route generation error:", error)
      showModal("Error", "Failed to generate route. Please try again.", null, "error", "exclamation-circle")
    } finally {
      setIsGeneratingRoute(false)
    }
  }

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
    const safeFinalStats = finalStats || stats; 
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
    });
  };


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
  const showModal = (title, message, onConfirm = null, type = "info", icon = null, buttons = []) => {
    setModalContent({ title, message, onConfirm, type, icon, buttons })
    setModalVisible(true)
  }

  const calculateMetrics = (distance, duration) => {
    const numDistance = Number(distance)
    const numDuration = Number(duration)
    if (numDistance < 5 || numDuration < 5 || isNaN(numDistance) || isNaN(numDuration)) {
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
      if (locationWatchRef.current) {
        locationWatchRef.current.remove()
        locationWatchRef.current = null
        console.log("MapScreen: Location watch stopped after finishing activity")
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

      const watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (location) => {
          const { latitude, longitude, accuracy, speed } = location.coords
          if (accuracy > 50) {
            setGpsSignal("Poor")
          } else if (accuracy > 30) {
            setGpsSignal("Fair")
          } else if (accuracy > 15) {
            setGpsSignal("Good")
          } else {
            setGpsSignal("Excellent")
          }
          const newRegion = {
            latitude,
            longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }
          setCurrentLocation(newRegion)
        },
      )
      locationWatchRef.current = watchId
      setLoading(false)
    } catch (err) {
      console.error("Location updates error:", err)
      setError("Failed to get location updates. Please check your GPS settings.")
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

    try {
      const hasPermission = await requestPermissions()
      if (!hasPermission) {
        setError("Location permissions not granted.")
        setIsTrackingLoading(false)
        return
      }

      if (locationWatchRef.current) {
        locationWatchRef.current.remove()
        locationWatchRef.current = null
        console.log("MapScreen: Location watch stopped after finishing activity")
      }

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
      }

      // Only reset coordinates and stats if starting a brand new activity
      if (coordinates.length === 0 || !isPaused) {
        // Check !isPaused here
        // If not resuming, or if it's a fresh start
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
          steps: 0, // NEW: Reset steps
          reps: 0, // NEW: Reset reps
        })
        console.log("MapScreen: Starting new tracking session with reset stats")
      } else {
        // If resuming, ensure lastCoordinateRef is set to the last recorded coordinate
        lastCoordinateRef.current = coordinates[coordinates.length - 1] || initialCoord
        startTimeRef.current = new Date(Date.now() - stats.duration * 1000) // Adjust start time for duration
        console.log("MapScreen: Resuming tracking session")
      }

      setTracking(true)
      setIsPaused(false) // Ensure not paused when starting/resuming
      setFollowingSuggestedRoute(followingSuggestedRoute)

      console.log("MapScreen: Initial coordinate set:", initialCoord)
      console.log(`MapScreen: Pace window size: ${paceWindowSizeRef.current} for ${activityType}`)

      intervalRef.current = setInterval(() => {
        setStats((prev) => {
          const duration = Math.floor((new Date() - startTimeRef.current) / 1000)
          const metrics = calculateMetrics(prev.distance, duration)
          return { ...prev, duration, ...metrics }
        })
      }, 1000)

      const id = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 1000,
        },
        (location) => {
          // NEW: Pause logic - do not process location updates if paused
          if (isPaused) {
            console.log("MapScreen: Location update skipped because activity is paused.")
            return
          }

          console.log("Location callback fired:", location.coords)
          const { latitude, longitude, accuracy, speed, altitude } = location.coords
          console.log(
            `MapScreen: Location update: lat=${latitude.toFixed(6)}, lng=${longitude.toFixed(6)}, acc=${accuracy.toFixed(1)}m`,
          )

          if (accuracy > 50 || speed > maxSpeed) {
            lowAccuracyCountRef.current += 1
            if (lowAccuracyCountRef.current >= 5) {
              setGpsSignal("Poor")
            }
            return
          }

          lowAccuracyCountRef.current = 0
          if (accuracy > 30) {
            setGpsSignal("Fair")
          } else if (accuracy > 15) {
            setGpsSignal("Good")
          } else {
            setGpsSignal("Excellent")
          }

          const newCoordinate = {
            latitude,
            longitude,
            accuracy,
            timestamp: location.timestamp,
            altitude,
          }

          rawCoordinatesRef.current.push(newCoordinate)
          if (rawCoordinatesRef.current.length > 5) rawCoordinatesRef.current.shift()

          const smoothedCoordinate = smoothCoordinate(rawCoordinatesRef.current, newCoordinate)

          // Update currentLocation for other uses (e.g., centerMap button)
          setCurrentLocation({
            latitude: smoothedCoordinate.latitude,
            longitude: smoothedCoordinate.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          })

          // Manually animate the map camera to the smoothed coordinate for fluid following
          if (mapRef.current) {
            mapRef.current.animateCamera(
              {
                center: {
                  latitude: smoothedCoordinate.latitude,
                  longitude: smoothedCoordinate.longitude,
                },
                // You can adjust zoom, pitch, heading here for more control
                // zoom: 16,
                // pitch: 0,
                // heading: 0,
              },
              { duration: 500 }, // Smooth transition duration in milliseconds
            )
          }

          const lastCoord = lastCoordinateRef.current
          if (lastCoord) {
            const distanceIncrement = calculateDistance(
              lastCoord.latitude,
              lastCoord.longitude,
              smoothedCoordinate.latitude,
              smoothedCoordinate.longitude,
            )
            console.log(`MapScreen: Raw distance increment: ${distanceIncrement.toFixed(2)}m from previous point`)

            const filteredIncrement = distanceIncrement >= distanceThreshold ? distanceIncrement : 0
            if (filteredIncrement === 0 && distanceIncrement > 0) {
              console.log(
                `MapScreen: Filtered out small movement (${distanceIncrement.toFixed(2)}m < ${distanceThreshold}m threshold)`,
              )
            }

            setStats((prevStats) => {
              const newDistance = Number(prevStats.distance) + Number(filteredIncrement)
              const duration = Math.floor((new Date() - startTimeRef.current) / 1000)
              const metrics = calculateMetrics(newDistance, duration)

              if (filteredIncrement > 0) {
                console.log(
                  `MapScreen: Updated stats: distance=${newDistance.toFixed(2)}m, duration=${duration}s, raw pace=${metrics.rawPace?.toFixed(2)}, smoothed pace=${metrics.pace?.toFixed(2)}`,
                )
              }

              return {
                ...prevStats,
                distance: newDistance,
                duration,
                ...metrics,
              }
            })
          } else {
            console.log("MapScreen: No previous coordinate available for distance calculation")
          }

          setCoordinates((prev) => [...prev, smoothedCoordinate])
          lastCoordinateRef.current = smoothedCoordinate
        },
      )
      setWatchId(id)
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
            console.log("MapScreen: Discarding activity and resetting quest progress");
            setCoordinates([]);
            setStats({ distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0 });
            setIsPaused(false);
            setTracking(false);

            // Reset quest progress but keep the quest active
            if (selectedQuest) {
              setSelectedQuest(prev => ({
                ...prev,
                progress: 0,
                status: "not_started"
              }));
            }

            navigateToActivity({ activityType });
            return true;
          },
          style: "danger",
        },
        {
          label: "Cancel",
          action: () => true,
          style: "secondary",
        },
      ],
    );
  };

  // Enhanced saveActivity with quest completion logic (same as ActivityScreen)
  const saveActivity = async () => {
    console.log("MapScreen: Starting save activity process");
    setIsTrackingLoading(true);

    // ADD THIS FLAG CHECK - Prevent duplicate saves
    if (stats._alreadySaved) {
      console.log("MapScreen: Activity already saved, navigating to dashboard");
      setIsTrackingLoading(false);
      navigateToDashboard(); // Navigate directly to dashboard
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        showModal("Error", "You must be logged in to save activities.", null, "error", "user-times");
        setIsTrackingLoading(false);
        return;
      }

      console.log("MapScreen: Validating activity data");
      if (stats.distance < 10) {
        showModal(
          "Activity Too Short",
          "Your activity was too short to save. Please track a longer distance.",
          () => returnToActivity(stats),
          "info",
          "exclamation-triangle"
        );
        setIsTrackingLoading(false);
        return;
      }

      console.log("MapScreen: Calculating activity metrics");
      const distanceInKm = stats.distance / 1000;
      const durationInHours = stats.duration / 3600;
      const durationInMinutes = stats.duration / 60;
      const calculatedMetrics = {
        distanceInKm,
        avgSpeed: durationInHours > 0 ? distanceInKm / durationInHours : 0,
        pace: distanceInKm > 0 ? durationInMinutes / distanceInKm : 0,
      };
      console.log("MapScreen: Calculated GPS metrics:", calculatedMetrics);

      const activityData = {
        userId: user.uid,
        activityType,
        distance: stats.distance,
        duration: stats.duration,
        pace: stats.pace,
        avgSpeed: calculatedMetrics.avgSpeed,
        steps: stats.steps || 0,
        reps: stats.reps || 0,
        calories: stats.calories || 0,
        coordinates: coordinates.map((coord) => ({
          latitude: coord.latitude,
          longitude: coord.longitude,
          timestamp: coord.timestamp,
        })),
        targetDistance: Number.parseFloat(targetDistance),
        targetTime: Number.parseInt(targetTime),
        createdAt: serverTimestamp(),
        followedSuggestedRoute: followingSuggestedRoute,
        _alreadySaved: true, // ADD THIS FLAG to prevent duplicate saves
      };

      let questCompleted = false;
      let xpEarned = 50;
      let questCompletionData = null;

      // FIXED: Quest completion logic - Use consistent calculation
      if (selectedQuest) {
        console.log("MapScreen: Processing quest completion for:", selectedQuest);
        activityData.questId = selectedQuest.id;
        activityData.questTitle = selectedQuest.title;
        activityData.questDescription = selectedQuest.description;
        activityData.questCategory = selectedQuest.category;

        // FIXED: Use the same calculation method as getDisplayQuestProgress
        let currentValue = 0;
        let questProgress = 0;

        if (selectedQuest.unit === "reps") {
          currentValue = stats.reps || 0;
          questProgress = currentValue / selectedQuest.goal;
        } else if (selectedQuest.unit === "distance" || selectedQuest.unit === "km") {
          currentValue = distanceInKm;
          questProgress = currentValue / selectedQuest.goal;
        } else if (selectedQuest.unit === "duration" || selectedQuest.unit === "minutes") {
          currentValue = durationInMinutes;
          questProgress = currentValue / selectedQuest.goal;
        } else if (selectedQuest.unit === "pace") {
          currentValue = stats.pace;
          // For pace quests (lower is better)
          questProgress = currentValue > 0 && currentValue <= selectedQuest.goal ? 1 : 0;
        } else if (selectedQuest.unit === "calories") {
          currentValue = stats.calories || 0;
          questProgress = currentValue / selectedQuest.goal;
        } else if (selectedQuest.unit === "steps") {
          currentValue = stats.steps || 0;
          questProgress = currentValue / selectedQuest.goal;
        }

        // FIXED: Use 99% threshold to avoid floating point precision issues
        questCompleted = questProgress >= 0.99;
        activityData.questProgress = Math.min(questProgress, 1);
        activityData.questStatus = questCompleted ? "completed" : "in_progress";

        console.log("MapScreen: Quest progress calculated:", {
          unit: selectedQuest.unit,
          currentValue,
          goal: selectedQuest.goal,
          progress: questProgress,
          completed: questCompleted,
          threshold: 0.99
        });

        if (questCompleted) {
          xpEarned += selectedQuest.xpReward || 0;

          // FIXED: Ensure all required fields for quest completion
          questCompletionData = {
            questId: selectedQuest.id,
            userId: user.uid,
            questTitle: selectedQuest.title,
            questDescription: selectedQuest.description,
            questGoal: selectedQuest.goal,
            questUnit: selectedQuest.unit,
            achievedValue: currentValue,
            activityType: activityType,
            xpEarned: selectedQuest.xpReward || 0,
            completedAt: serverTimestamp(),
            activityData: {
              distance: distanceInKm,
              duration: durationInMinutes,
              avgSpeed: calculatedMetrics.avgSpeed,
              steps: stats.steps || 0,
              pace: stats.pace,
            },
          };
          console.log("MapScreen: Quest completed! Completion data:", questCompletionData);

          try {
            await addDoc(collection(db, "quest_completions"), questCompletionData);
            console.log("MapScreen: Quest completion saved to Firestore");
          } catch (error) {
            console.error("MapScreen: Error saving quest completion:", error);
          }
        }

        // FIXED: Update challenge progress if this is a challenge quest
        if (selectedQuest.category === "challenge") {
          try {
            const challengeRef = doc(db, "challenges", selectedQuest.id);
            const challengeDoc = await getDoc(challengeRef);

            if (challengeDoc.exists()) {
              const challengeData = challengeDoc.data();
              const progress = challengeData.progress || {};
              const status = challengeData.status || {};
              const goal = Number(challengeData.goal) || 0;

              // Calculate value to add based on unit
              let valueToAdd = 0;
              if (selectedQuest.unit === "reps") {
                valueToAdd = stats.reps || 0;
              } else if (selectedQuest.unit === "distance" || selectedQuest.unit === "km") {
                valueToAdd = distanceInKm;
              } else if (selectedQuest.unit === "duration" || selectedQuest.unit === "minutes") {
                valueToAdd = durationInMinutes;
              } else if (selectedQuest.unit === "steps") {
                valueToAdd = stats.steps || 0;
              } else if (selectedQuest.unit === "calories") {
                valueToAdd = stats.calories || 0;
              }

              // Update progress safely
              const newProgressValue = (progress[user.uid] || 0) + valueToAdd;
              const newStatusValue = goal > 0 && newProgressValue >= goal ? "completed" : "in_progress";

              await updateDoc(challengeRef, {
                [`progress.${user.uid}`]: newProgressValue,
                [`status.${user.uid}`]: newStatusValue,
              });

              console.log("MapScreen: Challenge progress updated:", {
                userId: user.uid,
                newProgressValue,
                newStatusValue
              });
            }
          } catch (err) {
            console.error("Error updating challenge progress:", err);
          }
        }
      }

      // Calculate bonus XP based on performance
      let bonusXP = 0;
      bonusXP += Math.floor(distanceInKm) * 10;
      bonusXP += Math.floor(stats.duration / 600) * 5;
      bonusXP += Math.floor((stats.steps || 0) / 1000) * 2;
      xpEarned += bonusXP;
      activityData.xpEarned = xpEarned;
      activityData.bonusXP = bonusXP;

      console.log("MapScreen: Total XP calculated:", {
        baseXP: 50,
        questXP: selectedQuest?.xpReward || 0,
        bonusXP,
        totalXP: xpEarned,
      });

      // Update user's XP and level in Firestore
      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const currentXP = userData.totalXP || 0;
          const currentLevel = userData.level || 1;
          const newTotalXP = currentXP + xpEarned;
          const newLevel = Math.floor(newTotalXP / 1000) + 1;

          const userUpdateData = {
            totalXP: newTotalXP,
            level: newLevel,
            lastActivityDate: serverTimestamp(),
            totalActivities: (userData.totalActivities || 0) + 1,
            totalDistance: (userData.totalDistance || 0) + distanceInKm,
            totalDuration: (userData.totalDuration || 0) + stats.duration,
            totalSteps: (userData.totalSteps || 0) + (stats.steps || 0),
          };

          // FIXED: Add quest-specific stats if quest was completed
          if (selectedQuest && questCompleted) {
            if (selectedQuest.unit === "reps") {
              userUpdateData.totalReps = (userData.totalReps || 0) + (stats.reps || 0);
            }
          }

          await updateDoc(userRef, userUpdateData);
          console.log("MapScreen: User data updated successfully");

          if (newLevel > currentLevel) {
            setTimeout(() => {
              showModal(
                "Level Up!",
                `Congratulations! You've reached level ${newLevel}! Keep up the great work!`,
                () => { },
                "success",
                "star"
              );
            }, 2000);
          }
        }
      } catch (error) {
        console.error("MapScreen: Error updating user XP:", error);
      }

      // Save activity to Firestore
      console.log("MapScreen: Saving activity to Firestore:", activityData);
      const activityDocRef = await addDoc(collection(db, "activities"), activityData);
      console.log("MapScreen: Activity saved with ID:", activityDocRef.id);

      // Prepare success message
      let successTitle = "Activity Saved";
      let successMessage = "";

      if (questCompleted) {
        successTitle = "Quest Completed!";
        successMessage = `🎉 Congratulations! You completed the "${selectedQuest?.title}" quest and earned ${xpEarned} XP!

📊 Workout Summary:
• ${distanceInKm.toFixed(2)} km distance
• ${formatTime(stats.duration)} duration
• ${calculatedMetrics.avgSpeed.toFixed(1)} km/h avg speed
• ${stats.steps.toLocaleString()} steps`;
      } else {
        successTitle = "Great Workout!";
        successMessage = `🏃‍♂️ Great ${activityType} session!

📊 Workout Summary:
• ${distanceInKm.toFixed(2)} km covered
• ${formatTime(stats.duration)} duration
• ${calculatedMetrics.avgSpeed.toFixed(1)} km/h avg speed
• ${stats.steps.toLocaleString()} steps
• ${xpEarned} XP earned`;
      }

      if (bonusXP > 0) {
        successMessage += `\n🌟 Bonus: +${bonusXP} XP for excellent performance!`;
      }

      // FIXED: Add quest progress info if not completed
      if (selectedQuest && !questCompleted) {
        const progress = getDisplayQuestProgress(selectedQuest);
        successMessage += `\n\n📈 Quest Progress: ${Math.round(progress * 100)}% complete`;
      }

      console.log("MapScreen: Activity saved successfully, showing success message");

      // MODIFIED: Navigate directly to dashboard instead of returning to activity screen
      showModal(
        successTitle,
        successMessage,
        () => {
          // Reset states
          setCoordinates([]);
          setStats({
            distance: 0,
            duration: 0,
            pace: 0,
            avgSpeed: 0,
            steps: 0,
            reps: 0,
            _alreadySaved: false // Reset flag for new activities
          });
          setIsPaused(false);
          setTracking(false);
          setFollowingSuggestedRoute(false);
          setSuggestedRoute(null);
          setShowSuggestedRoute(false);
          recentPacesRef.current = [];
          setSmoothedPace(0);

          // NAVIGATE DIRECTLY TO DASHBOARD TO PREVENT DUPLICATE SAVES
          navigateToDashboard();
        },
        "success",
        "check-circle"
      );

    } catch (error) {
      console.error("MapScreen: Error saving activity:", error);
      let errorMessage = "Failed to save activity. Please try again.";
      if (error.code === "permission-denied") {
        errorMessage = "You don't have permission to save this activity. Please check your login status.";
      } else if (error.code === "network-request-failed") {
        errorMessage = "Network error. Please check your internet connection and try again.";
      } else if (error.code === "quota-exceeded") {
        errorMessage = "Storage quota exceeded. Please contact support.";
      }
      showModal("Error", errorMessage, null, "error", "exclamation-circle");
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
                        {getCurrentQuestValue(selectedQuest).toFixed(selectedQuest.unit === "distance" ? 2 : 0)} /{" "}
                        {selectedQuest.goal} {selectedQuest.unit}
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
              {formatTime(stats.duration)}
            </CustomText>
          </View>

          {/* Middle Section - Average Pace / Current Speed */}
          <View style={twrnc`px-6 py-8 items-center`}>
            <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>
              {activityType === "cycling" ? "Speed" : "Avg Pace"}
            </CustomText>
            <CustomText weight="bold" style={twrnc`text-white text-5xl`}>
              {activityType === "cycling" ? `${stats.avgSpeed.toFixed(1)}` : formatPace(stats.pace)}
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-lg mt-2`}>
              {activityType === "cycling" ? "km/h" : "/km"}
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
                    <View
                      key={index}
                      style={[twrnc`bg-[#FFC107] rounded-t-sm mr-1 flex-1`, { height: height * 60 }]}
                    />
                  ))}
                </View>
              </View>

              {/* Right: Distance */}
              <View style={twrnc`items-end`}>
                <CustomText style={twrnc`text-gray-400 text-sm mb-2`}>Distance</CustomText>
                <CustomText weight="bold" style={twrnc`text-white text-4xl`}>
                  {(stats.distance / 1000).toFixed(2)}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-lg`}>km</CustomText>
              </View>
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

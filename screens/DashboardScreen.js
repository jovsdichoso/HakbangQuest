// FileName: DashboardScreen.js
"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Dimensions,
  Pressable,
  Animated,
  Easing,
} from "react-native"

import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps"
import AsyncStorage from "@react-native-async-storage/async-storage"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import * as Location from "expo-location"
import { getDocs, collection, query, where } from "firebase/firestore"
import { db, auth } from "../firebaseConfig"
import { formatTime } from "../utils/activityUtils"
import { QuestProgressManager } from "../utils/QuestProgressManager"
import QuestManager from "../utils/QuestManager";

// Badge System Imports
import {
  getUserQuestHistory,
  calculateBadgeStats,
  evaluateBadges,
  loadBadgesFromFirestore,
  saveBadgesToFirestore,
  claimBadgeReward, // ADDED
  getAllBadgesWithStatus,
} from "./BadgeSystem"
import { BadgeModal, BadgeNotification, AllBadgesModal, BadgeSection } from "../components/BadgeComponents"

const { width } = Dimensions.get("window")

const safeParseJSON = (str, defaultValue = {}) => {
  try {
    return str ? JSON.parse(str) : defaultValue
  } catch (error) {
    console.error("JSON parse error:", error.message)
    return defaultValue
  }
}

const formatDate = (date = new Date()) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]
  const dayName = days[date.getDay()]
  const day = date.getDate()
  const month = months[date.getMonth()]
  return `${dayName}, ${day} ${month}`
}

const formatPaceString = (pace) => {
  if (!pace) return "0:00/km";

  // If it's already a string like "6:30/km", return it
  if (typeof pace === "string" && pace.includes(":")) return pace;

  // If it's a number (or string number), format it
  const paceNum = Number(pace);
  if (isNaN(paceNum) || paceNum === 0) return "0:00/km";

  const mins = Math.floor(paceNum);
  const secs = Math.round((paceNum - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
};

const calculateMapRegion = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }
  }
  const latitudes = coordinates.map((coord) => coord.latitude).filter((lat) => typeof lat === "number" && !isNaN(lat))
  const longitudes = coordinates.map((coord) => coord.longitude).filter((lon) => typeof lon === "number" && !isNaN(lon))

  if (latitudes.length === 0 || longitudes.length === 0) {
    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }
  }

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)

  const latitude = (minLat + maxLat) / 2
  const longitude = (minLon + maxLon) / 2

  const latitudeDelta = (maxLat - minLat) * 1.5 || 0.005
  const longitudeDelta = (maxLon - minLon) * 1.5 || 0.005

  return { latitude, longitude, latitudeDelta, longitudeDelta }
}

const getWeekDates = () => {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)

  const weekDates = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    weekDates.push({
      day: date.getDate(),
      dayName: ["S", "M", "T", "W", "T", "F", "S"][i],
      isToday: date.toDateString() === today.toDateString(),
      date: date,
    })
  }
  return weekDates
}

const getMonthCalendar = (year, month) => {
  const today = new Date()
  const firstDayOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const firstDayWeekday = firstDayOfMonth.getDay()

  const calendarDays = []

  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push({ day: null, isCurrentMonth: false, date: null })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    calendarDays.push({
      day: day,
      isToday: date.toDateString() === today.toDateString(),
      isCurrentMonth: true,
      date: date,
    })
  }

  const remainingSlots = 42 - calendarDays.length
  if (remainingSlots > 0 && remainingSlots < 7) {
    for (let i = 1; i <= remainingSlots; i++) {
      calendarDays.push({ day: i, isCurrentMonth: false, date: new Date(year, month + 1, i) })
    }
  }
  return calendarDays
}

const getMonthYearString = (date) => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

const getActivityDisplayInfo = (activity) => {
  const activityType = activity.activityType || "unknown"

  if (["walking", "running", "jogging", "cycling"].includes(activityType)) {
    const distanceMeters = activity.distance || activity.distanceRaw || 0
    const distanceKm = (Number(distanceMeters) / 1000).toFixed(2)
    const durationSeconds = activity.duration || activity.durationSeconds || 0
    const formattedDuration = typeof durationSeconds === "number" ? formatTime(durationSeconds) : durationSeconds
    const rawPace = activity.pace || activity.stats?.pace;
    const formattedPace = formatPaceString(rawPace);


    return {
      primaryMetric: {
        label: "Distance",
        value: `${distanceKm} km`,
        icon: "map-outline",
        color: "#06D6A0",
      },
      secondaryMetric: {
        label: "Duration",
        value: formattedDuration,
        icon: "time-outline",
        color: "#FFC107",
      },
      tertiaryMetric: {
        label: activityType === "cycling" ? "Speed" : "Pace",
        value: activityType === "cycling" ? formattedSpeed : formattedPace,
        icon: "speedometer-outline",
        color: "#4361EE",
      },
    }
  }

  const isStrength =
    (activity.reps || activity.reps || 0) > 0 ||
    ["pushup", "pullup", "squat", "plank", "situp", "normal"].includes(activityType)

  if (isStrength) {
    const durationSeconds = activity.duration || activity.durationSeconds || 0
    const formattedDuration = typeof durationSeconds === "number" ? formatTime(durationSeconds) : durationSeconds
    const repsCount = activity.reps || 0
    const setsCount = activity.sets || 1
    const isPlank = activityType === "plank"

    return {
      primaryMetric: {
        label: isPlank ? "Duration" : "Reps",
        value: isPlank ? formattedDuration : repsCount.toString(),
        icon: isPlank ? "time-outline" : "fitness-outline",
        color: "#EF476F",
      },
      secondaryMetric: {
        label: "Sets",
        value: setsCount.toString(),
        icon: "repeat-outline",
        color: "#FFC107",
      },
      tertiaryMetric: {
        label: isPlank ? "Rest" : "Total Time",
        value: isPlank ? "0:00" : formattedDuration,
        icon: "stopwatch-outline",
        color: "#4361EE",
      },
    }
  }

  if (["yoga", "stretching", "meditation"].includes(activityType)) {
    const durationSeconds = activity.duration || activity.durationSeconds || 0
    const formattedDuration = typeof durationSeconds === "number" ? formatTime(durationSeconds) : durationSeconds

    return {
      primaryMetric: {
        label: "Duration",
        value: formattedDuration,
        icon: "time-outline",
        color: "#06D6A0",
      },
      secondaryMetric: {
        label: "Poses/Stretches",
        value: activity.poses || activity.stretches || activity.exercises || "0",
        icon: "body-outline",
        color: "#FFC107",
      },
      tertiaryMetric: {
        label: "Intensity",
        value: activity.intensity || "Moderate",
        icon: "pulse-outline",
        color: "#4361EE",
      },
    }
  }

  const durationSeconds = activity.duration || activity.durationSeconds || 0
  const formattedDuration = typeof durationSeconds === "number" ? formatTime(durationSeconds) : durationSeconds

  return {
    primaryMetric: {
      label: "Duration",
      value: formattedDuration,
      icon: "time-outline",
      color: "#06D6A0",
    },
    secondaryMetric: {
      label: "Type",
      value: activityType.charAt(0).toUpperCase() + activityType.slice(1),
      icon: "fitness-outline",
      color: "#FFC107",
    },
    tertiaryMetric: {
      label: "Completed",
      value: "✓",
      icon: "checkmark-circle-outline",
      color: "#4361EE",
    },
  }
}

const DashboardScreen = ({ navigateToActivity, navigation, userData }) => {
  const { width } = Dimensions.get("window")
  const isSmallDevice = width < 375
  const isMediumDevice = width >= 375 && width < 414

  const responsiveFontSizes = {
    xs: isSmallDevice ? 10 : isMediumDevice ? 11 : 12,
    sm: isSmallDevice ? 12 : isMediumDevice ? 13 : 14,
    base: isSmallDevice ? 14 : isMediumDevice ? 15 : 16,
    lg: isSmallDevice ? 16 : isMediumDevice ? 18 : 20,
    xl: isSmallDevice ? 18 : isMediumDevice ? 20 : 22,
    "2xl": isSmallDevice ? 20 : isMediumDevice ? 22 : 24,
  }

  const responsivePadding = {
    base: isSmallDevice ? 3 : isMediumDevice ? 4 : 5,
    lg: isSmallDevice ? 4 : isMediumDevice ? 5 : 6,
  }

  const [activityData, setActivityData] = useState({
    coordinates: [],
    distance: "0 km",
    duration: "0:00",
    activityType: "walking",
    stats: { pace: "0:00/km", avgSpeed: "0 km/h" },
    distanceRaw: 0,
    durationSeconds: 0,
    reps: 0,
    sets: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dynamicQuests, setDynamicQuests] = useState([])
  const [userStats, setUserStats] = useState({
    avgDailyDistance: userData?.avgDailyDistance || 2.5,
    avgActiveDuration: userData?.avgActiveDuration || 45,
    avgDailyReps: userData?.avgDailyReps || 20,
    level: userData?.level || 1,
    totalXP: userData?.totalXP || 0,
  })
  const [questLoading, setQuestLoading] = useState(true)
  const [weeklyProgress, setWeeklyProgress] = useState([])
  const [monthlyProgress, setMonthlyProgress] = useState([])
  const [isQuestModalVisible, setIsQuestModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isDateActivitiesModalVisible, setIsDateActivitiesModalVisible] = useState(false)
  const [dateActivities, setDateActivities] = useState([])

  const [todaysTotals, setTodaysTotals] = useState({
    distanceKm: 0,
    durationSec: 0,
    reps: 0,
    distanceMeters: 0,
  })

  // Badge System States
  const [allBadges, setAllBadges] = useState([])
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState([])
  const [isAllBadgesModalVisible, setIsAllBadgesModalVisible] = useState(false)
  const [isBadgeDetailModalVisible, setIsBadgeDetailModalVisible] = useState(false)
  const [selectedBadge, setSelectedBadge] = useState(null)
  const [isBadgeNotificationVisible, setIsBadgeNotificationVisible] = useState(false)

  const [periodStats, setPeriodStats] = useState({
    avgDailyDistance: 0,
    avgActiveDuration: 0,
    avgDailyReps: 0,
  })

  // Animation refs
  const headerFadeAnim = useRef(new Animated.Value(0)).current
  const headerSlideAnim = useRef(new Animated.Value(-50)).current
  const statsSlideAnim = useRef(new Animated.Value(50)).current
  const questScaleAnim = useRef(new Animated.Value(0.9)).current
  const patternAnim = useRef(new Animated.Value(0)).current
  const calendarFadeAnim = useRef(new Animated.Value(0)).current

  const toJsDate = (t) => (t?.toDate ? t.toDate() : t instanceof Date ? t : t ? new Date(t) : null)

  const startOfDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const endOfDay = (d) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }

  const toKm = (val) => {
    const n = typeof val === "string" ? Number.parseFloat(val) : typeof val === "number" ? val : 0
    if (!isFinite(n)) return 0
    return n / 1000
  }

  const toSeconds = (duration) => {
    if (typeof duration === "number") return isFinite(duration) ? duration : 0
    if (typeof duration === "string") {
      const parts = duration.split(":").map((p) => Number.parseInt(p, 10) || 0)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
      if (parts.length === 1) return parts[0]
    }
    return 0
  }

  const formatKm = (km) => `${(km || 0).toFixed(2)} km`

  const [timePeriod, setTimePeriod] = useState("week")
  const [isTimeDropdownVisible, setIsTimeDropdownVisible] = useState(false)

  const [isActivityModalVisible, setIsActivityModalVisible] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState(null)

  const [currentMonthDate, setCurrentMonthDate] = useState(new Date())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date())

  const weekDates = useMemo(() => getWeekDates(), [])
  const monthCalendar = useMemo(
    () => getMonthCalendar(currentMonthDate.getFullYear(), currentMonthDate.getMonth()),
    [currentMonthDate]
  )

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(headerSlideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(statsSlideAnim, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(questScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(calendarFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 600,
        useNativeDriver: true,
      }),
    ]).start()

    Animated.loop(
      Animated.timing(patternAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [])

  const patternRotation = patternAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  })

  const initializeUserData = useCallback(async () => {
    const defaultUserStats = {
      avgDailyDistance: 2.5,
      avgActiveDuration: 45,
      avgDailyReps: 20,
      level: 1,
      totalXP: 0,
    }

    try {
      const storedUserData = await AsyncStorage.getItem("userData")
      const storedSession = await AsyncStorage.getItem("userSession")
      const userDataParsed = safeParseJSON(storedUserData, defaultUserStats)
      const sessionData = safeParseJSON(storedSession, null)

      const isValidSession =
        sessionData?.uid &&
        sessionData.emailVerified &&
        (auth.currentUser ? auth.currentUser.uid === sessionData.uid : true)

      if (isValidSession) {
        setUserStats((prevStats) => ({
          ...prevStats,
          avgDailyDistance: userDataParsed.avgDailyDistance || defaultUserStats.avgDailyDistance,
          avgActiveDuration: userDataParsed.avgActiveDuration || defaultUserStats.avgActiveDuration,
          avgDailyReps: userDataParsed.avgDailyReps || defaultUserStats.avgDailyReps,
          level: userDataParsed.level || defaultUserStats.level,
          totalXP: userDataParsed.totalXP || defaultUserStats.totalXP,
        }))
        return { isValidSession: true, userData: { ...userDataParsed, uid: sessionData.uid, email: sessionData.email } }
      } else {
        setError("No valid user session found. Please sign in.")
        setLoading(false)
        return { isValidSession: false, userData: defaultUserStats }
      }
    } catch (error) {
      console.error("Error initializing user data:", error.message)
      setError("Failed to load user data. Please try again.")
      setLoading(false)
      return { isValidSession: false, userData: defaultUserStats }
    }
  }, [])

  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== "granted") {
          setError("Permission to access location was denied")
          console.warn("Location permission denied")
          return
        }
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 10,
        })
      } catch (err) {
        console.error("Location error:", err.message)
        setError("Failed to get location. Please ensure location services are enabled.")
      }
    }
    getUserLocation()
    initializeUserData()
  }, [initializeUserData])

  useEffect(() => {
    if (userData && (userData.level || userData.totalXP)) {
      setUserStats((prevStats) => ({
        ...prevStats,
        avgDailyDistance: userData.avgDailyDistance || prevStats.avgDailyDistance,
        avgActiveDuration: userData.avgActiveDuration || prevStats.avgActiveDuration,
        avgDailyReps: userData.avgDailyReps || prevStats.avgDailyReps,
        level: userData.level || prevStats.level,
        totalXP: userData.totalXP || prevStats.totalXP,
      }))
    }
  }, [userData])

  const calculateUserStats = (activitiesData) => {
    if (!Array.isArray(activitiesData) || activitiesData.length === 0) {
      return {
        avgDailyDistance: 2.5,
        avgActiveDuration: 45,
        avgDailyReps: 20,
        level: userData?.level || 1,
        totalXP: userData?.totalXP || 0,
      }
    }

    // 2. Calculate Averages (Keep this logic)
    const totalDistance = activitiesData.reduce((sum, act) => sum + (Number(act.distance) || 0), 0)
    const totalDuration = activitiesData.reduce((sum, act) => sum + toSeconds(act.duration || act.durationSeconds || 0), 0)
    const totalReps = activitiesData.reduce((sum, act) => sum + (Number(act.reps) || 0), 0)

    const uniqueDays = new Set(
      activitiesData
        .map((act) => (act.createdAt?.toDate ? act.createdAt.toDate().toDateString() : new Date().toDateString()))
        .filter(Boolean)
    ).size

    const avgDailyDistance = Number((toKm(totalDistance) / Math.max(uniqueDays, 1)).toFixed(2))
    const avgActiveDuration = Math.round(totalDuration / 60 / Math.max(activitiesData.length, 1))
    const avgDailyReps = Math.round(totalReps / Math.max(uniqueDays, 1))

    // 3. FIX: Use the Source of Truth for Level & XP
    // Instead of recalculating based on activity count (which was wrong),
    // we use the 'userData' prop from the component which comes from Firestore.
    const level = userData?.level || 1
    const totalXP = userData?.totalXP || userData?.xp || 0

    return {
      avgDailyDistance,
      avgActiveDuration,
      avgDailyReps,
      level,
      totalXP,
    }
  }


  const calculateQuestProgress = useCallback((quest) => {
    if (!quest) return 0;
    const progressPercentage = QuestProgressManager.getProgressPercentage(quest, {
      distance: todaysTotals.distanceMeters,
      duration: todaysTotals.durationSec,
      reps: todaysTotals.reps,
    }, todaysTotals.calories || 0);

    return progressPercentage;
  }, [todaysTotals]);

  const getCurrentQuestValue = useCallback((quest) => {
    if (!quest) return 0;
    const totalValue = QuestProgressManager.getTotalValue(quest, {
      distance: todaysTotals.distanceMeters,
      duration: todaysTotals.durationSec,
      reps: todaysTotals.reps,
    }, todaysTotals.calories || 0);

    return totalValue;
  }, [todaysTotals]);


  const getQuestStatus = useCallback(
    (quest) => {
      const progress = calculateQuestProgress(quest)
      if (progress >= 1) return "completed"
      if (progress > 0) return "in_progress"
      return "not_started"
    },
    [calculateQuestProgress]
  )

  const fetchData = useCallback(
    async (newlyAwardedBadges = []) => {
      try {
        setLoading(true);
        const user = auth.currentUser;
        let sessionData = null;

        if (!user) {
          const storedSession = await AsyncStorage.getItem("userSession");
          sessionData = safeParseJSON(storedSession, null);
          if (!sessionData?.uid || !sessionData.emailVerified) {
            setError("Please sign in to view activities");
            setLoading(false);
            setQuestLoading(false);
            setRefreshing(false);
            return;
          }
        }

        const userId = user ? user.uid : sessionData.uid;

        let startDate, endDate;
        if (timePeriod === "week") {
          const weekDates = getWeekDates();
          startDate = new Date(weekDates[0].date);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(weekDates[6].date);
          endDate.setHours(23, 59, 59, 999);
        } else {
          const year = currentMonthDate.getFullYear();
          const month = currentMonthDate.getMonth();
          startDate = new Date(year, month, 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(year, month + 1, 0);
          endDate.setHours(23, 59, 59, 999);
        }

        const activitiesRef = collection(db, "activities");
        const questActivitiesRef = collection(db, "quest_activities");
        const challengeActivitiesRef = collection(db, "challenge_activities");
        const normalActivitiesRef = collection(db, "normal_activities");

        const createQuery = (ref) =>
          query(ref, where("userId", "==", userId), where("createdAt", ">=", startDate), where("createdAt", "<=", endDate));

        const [activitiesSnap, questActivitiesSnap, challengeActivitiesSnap, normalActivitiesSnap] = await Promise.all([
          getDocs(createQuery(activitiesRef)),
          getDocs(createQuery(questActivitiesRef)),
          getDocs(createQuery(challengeActivitiesRef)),
          getDocs(createQuery(normalActivitiesRef)),
        ]);

        const activitiesData = activitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const questActivitiesData = questActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const challengeActivitiesData = challengeActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const normalActivitiesData = normalActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Combine all arrays
        const rawActivities = [
          ...activitiesData,
          ...questActivitiesData,
          ...challengeActivitiesData,
          ...normalActivitiesData
        ];

        // Deduplicate by ID using a Map
        const uniqueActivitiesMap = new Map();
        rawActivities.forEach(item => {
          if (item.id) uniqueActivitiesMap.set(item.id, item);
        });

        const allPeriodActivities = Array.from(uniqueActivitiesMap.values());

        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        const todaysActivities = allPeriodActivities.filter((a) => {
          const d = toJsDate(a.createdAt);
          return d && d >= todayStart && d <= todayEnd;
        });

        const todayTotals = todaysActivities.reduce(
          (acc, a) => {
            const distanceMeters = Number(a.distance || a.distanceRaw || 0);
            const durationSeconds = toSeconds(a.duration || a.durationSeconds || 0);
            const repsCount = Number(a.reps || 0);
            const caloriesCount = Number(a.calories || 0);

            acc.distanceMeters += distanceMeters;
            acc.distanceKm += toKm(distanceMeters);
            acc.durationSec += durationSeconds;
            acc.reps += repsCount;
            acc.calories += caloriesCount;

            return acc;
          },
          { distanceKm: 0, distanceMeters: 0, durationSec: 0, reps: 0, calories: 0 }
        );

        setTodaysTotals(todayTotals);

        const latestActivity =
          todaysActivities.length > 0
            ? [...todaysActivities].sort((a, b) => (toJsDate(b.createdAt) || new Date()) - (toJsDate(a.createdAt) || new Date()))[0]
            : allPeriodActivities.length > 0
              ? [...allPeriodActivities].sort((a, b) => (toJsDate(b.createdAt) || new Date()) - (toJsDate(a.createdAt) || new Date()))[0]
              : null;

        if (latestActivity) {
          const formattedTodayDistance = formatKm(todayTotals.distanceKm);
          const formattedTodayDuration = formatTime
            ? formatTime(todayTotals.durationSec)
            : `${Math.floor(todayTotals.durationSec / 60)
              .toString()
              .padStart(2, "0")}:${Math.floor(todayTotals.durationSec % 60)
                .toString()
                .padStart(2, "0")}`;

          const formattedPace = formatPaceString(latestActivity?.pace);

          setActivityData({
            coordinates: Array.isArray(latestActivity?.coordinates) ? latestActivity.coordinates : [],
            activityType: latestActivity?.activityType || "walking",
            stats: {
              pace: formattedPace,
              avgSpeed: latestActivity?.avgSpeed ? `${Number.parseFloat(latestActivity.avgSpeed).toFixed(1)} km/h` : "0 km/h",
            },
            distance: formattedTodayDistance,
            duration: formattedTodayDuration,
            distanceRaw: todayTotals.distanceMeters,
            durationSeconds: todayTotals.durationSec,
            reps: todayTotals.reps,
            sets: 1,
          });
        } else {
          setActivityData({
            coordinates: [],
            distance: "0 km",
            duration: "0:00",
            activityType: "walking",
            stats: { pace: "0:00/km", avgSpeed: "0 km/h" },
            distanceRaw: 0,
            durationSeconds: 0,
            reps: 0,
            sets: 0,
          });
        }

        const allActivitiesQuery = query(collection(db, "activities"), where("userId", "==", userId));
        const allQuestActivitiesQuery = query(collection(db, "quest_activities"), where("userId", "==", userId));
        const allChallengeActivitiesQuery = query(collection(db, "challenge_activities"), where("userId", "==", userId));
        const allNormalActivitiesQuery = query(collection(db, "normal_activities"), where("userId", "==", userId));

        const [allActivitiesSnap, allQuestActivitiesSnap, allChallengeActivitiesSnap, allNormalActivitiesSnap] = await Promise.all([
          getDocs(allActivitiesQuery),
          getDocs(allQuestActivitiesQuery),
          getDocs(allChallengeActivitiesQuery),
          getDocs(allNormalActivitiesQuery),
        ]);

        const allActivitiesData = [
          ...allActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          ...allQuestActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          ...allChallengeActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          ...allNormalActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ];

        const calculatedStats = calculateUserStats(allActivitiesData);
        setPeriodStats({
          avgDailyDistance: calculatedStats.avgDailyDistance,
          avgActiveDuration: calculatedStats.avgActiveDuration,
          avgDailyReps: calculatedStats.avgDailyReps,
        });

        try {
          console.log("[QuestManager] Cleaning up expired quests...");
          await QuestManager.cleanupExpiredQuests(userId);

          console.log("[QuestManager] Loading or generating daily quests...");
          const userQuests = await QuestManager.generateDailyQuests(userId, calculatedStats);
          setDynamicQuests(userQuests);

          console.log(`[QuestManager] Loaded ${userQuests.length} quests for dashboard`);
        } catch (questError) {
          console.error("[QuestManager] Error loading quests:", questError);
          setDynamicQuests([]);
        }

        // Badge System with Offline Error Handling
        let currentBadges = [];
        let badgesToNotify = [];

        try {
          // 1. Load what the user has actually earned from Firestore
          const earnedBadgesFromFireStore = await loadBadgesFromFirestore(userId);

          // 2. Run the logic to see if they earned NEW ones right now
          const userQuestHistory = await getUserQuestHistory(userId);
          const badgeStats = calculateBadgeStats(allActivitiesData, userQuestHistory);
          const newBadges = evaluateBadges(badgeStats, earnedBadgesFromFireStore);

          if (newBadges.length > 0) {
            const updatedEarnedBadges = [...earnedBadgesFromFireStore, ...newBadges];
            await saveBadgesToFirestore(userId, updatedEarnedBadges);

            // Update our local reference of earned badges
            currentBadges = updatedEarnedBadges;
            badgesToNotify = newBadges;
          } else {
            currentBadges = earnedBadgesFromFireStore;
          }

          // 3. HERE IS THE FIX: Merge earned badges with the full list
          // This ensures 'allBadges' contains locked items too
          const fullBadgeList = getAllBadgesWithStatus(currentBadges);
          setAllBadges(fullBadgeList);

          if (badgesToNotify.length > 0) {
            setNewlyEarnedBadges(badgesToNotify);
            setIsBadgeNotificationVisible(true);
          }
        } catch (error) {
          console.error("[Badge Pipeline] Error in badge pipeline:", error);
        }

        const referenceQuest = await (async () => {
          try {
            const userQuests = await QuestManager.loadUserQuests(userId);
            return userQuests[0] || null;
          } catch {
            return null;
          }
        })();

        if (referenceQuest) {
          const calculateDayQuestProgress = (activities, quest) => {
            const dayStats = activities.reduce(
              (acc, act) => {
                const distanceMeters = Number(act.distance || act.distanceRaw) || 0;
                const durationSeconds = toSeconds(act.duration || act.durationSeconds || 0);
                const repsCount = Number(act.reps) || 0;

                acc.distanceMeters += distanceMeters;
                acc.durationSec += durationSeconds;
                acc.reps += repsCount;
                return acc;
              },
              { distanceMeters: 0, durationSec: 0, reps: 0 }
            );

            const progressStats = {
              distance: dayStats.distanceMeters,
              duration: dayStats.durationSec,
              reps: dayStats.reps,
            };

            const mockQuest = { ...quest, progress: 0 };
            const progress = QuestProgressManager.getProgressPercentage(mockQuest, progressStats, 0);

            return {
              progress: progress,
              completed: progress >= 1,
              activities: activities,
            };
          };

          const weekProgress = weekDates.map(({ date }) => {
            const start = startOfDay(date);
            const end = endOfDay(date);

            const dayActivities = allPeriodActivities.filter((act) => {
              const actDate = act.createdAt?.toDate();
              return actDate && actDate >= start && actDate <= end;
            });

            return calculateDayQuestProgress(dayActivities, referenceQuest);
          });
          setWeeklyProgress(weekProgress);

          const monthProgress = monthCalendar.map(({ date, isCurrentMonth }) => {
            if (!date || !isCurrentMonth) return { date, progress: 0, completed: false, activities: [] };

            const start = startOfDay(date);
            const end = endOfDay(date);

            const dayActivities = allPeriodActivities.filter((act) => {
              const actDate = act.createdAt?.toDate();
              return actDate && actDate >= start && actDate <= end;
            });

            return {
              date,
              ...calculateDayQuestProgress(dayActivities, referenceQuest),
            };
          });
          setMonthlyProgress(monthProgress);
        }

        setLoading(false);
        setQuestLoading(false);
        setRefreshing(false);
      } catch (err) {
        console.error("Error fetching data:", err.message);
        setError("Failed to load dashboard data. Please try again.");
        setLoading(false);
        setQuestLoading(false);
        setRefreshing(false);
      }
    },
    [timePeriod, currentMonthDate, userStats.level]
  );

  useEffect(() => {
    const init = async () => {
      const { isValidSession } = await initializeUserData();
      if (isValidSession) {
        const newBadgesFromNav = navigation?.getState?.()?.routes?.find(r => r.name === "Dashboard")?.params?.newlyEarnedBadges;
        if (newBadgesFromNav) {
          navigation.setParams?.({ newlyEarnedBadges: undefined });
        }
        fetchData(newBadgesFromNav);
      } else {
        setError("Please sign in to view activities");
        setLoading(false);
      }
    };

    let unsubscribe;
    if (navigation?.addListener) {
      unsubscribe = navigation.addListener("focus", () => {
        console.log("Dashboard Screen focused. Triggering data refresh.");
        const newBadgesFromNav = navigation?.getState?.()?.routes?.find(r => r.name === "Dashboard")?.params?.newlyEarnedBadges;
        if (newBadgesFromNav) {
          navigation.setParams?.({ newlyEarnedBadges: undefined });
        }
        if (!newBadgesFromNav || newBadgesFromNav.length === 0) {
          fetchData();
        } else {
          fetchData(newBadgesFromNav);
        }
      });
    }

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [initializeUserData, fetchData, navigation]);


  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [fetchData])

  const navigateToQuestActivity = async (quest) => {
    try {
      setIsQuestModalVisible(false);
      const currentProgress = getCurrentQuestValue(quest);
      const progressPercentage = calculateQuestProgress(quest);
      const currentStatus = getQuestStatus(quest);

      navigateToActivity({
        questId: quest.id,
        title: quest.title,
        description: quest.description,
        goal: quest.goal,
        unit: quest.unit,
        progress: currentProgress,
        progressPercentage: progressPercentage,
        status: currentStatus,
        activityType: quest.activityType,
        xpReward: quest.xpReward,
        difficulty: quest.difficulty,
        category: quest.category,
      });
    } catch (error) {
      console.error("Error starting quest", error);
    }
  };

  const viewActivityDetails = (activity) => {
    setSelectedActivity(activity)
    setIsActivityModalVisible(true)
  }

  const resumeActivity = () => {
    setIsActivityModalVisible(false)
    if (selectedActivity) {
      navigateToActivity({
        activityType: selectedActivity.activityType,
        coordinates: Array.isArray(selectedActivity.coordinates) ? selectedActivity.coordinates : [],
        stats: {
          distance: Number.parseFloat(selectedActivity.distance) * 1000 || 0,
          duration:
            selectedActivity.duration
              ?.split(":")
              .reduce((acc, time, index) => acc + Number.parseInt(time) * (index === 0 ? 60 : 1), 0) || 0,
          pace:
            selectedActivity.stats?.pace
              ?.replace("/km", "")
              .split(":")
              .reduce((acc, time, index) => acc + Number.parseInt(time) * (index === 0 ? 60 : 1), 0) || 0,
          avgSpeed: Number.parseFloat(selectedActivity.stats?.avgSpeed) || 0,
        },
      })
    }
  }

  const clearActivity = () => {
    setIsActivityModalVisible(false)
  }

  const toggleTimeDropdown = () => {
    setIsTimeDropdownVisible(!isTimeDropdownVisible)
  }

  const selectTimePeriod = (period) => {
    setTimePeriod(period)
    setIsTimeDropdownVisible(false)
  }

  const handleBadgePress = (badge) => {
    setSelectedBadge(badge)
    setIsBadgeDetailModalVisible(true)
  }

  // --- NEW: HANDLE CLAIM REWARD ---
  const handleClaimReward = async (badge) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Call the backend logic
      const result = await claimBadgeReward(user.uid, badge.id);

      // Optimistically update local state
      if (result.success) {
        // Update All Badges List
        const updatedBadges = allBadges.map(b =>
          b.id === badge.id ? { ...b, claimed: true } : b
        );
        setAllBadges(updatedBadges);

        // Update Selected Badge (to refresh Modal UI immediately)
        setSelectedBadge(prev => ({ ...prev, claimed: true }));

        // Update User XP Stats (Add reward to current state)
        setUserStats(prev => ({
          ...prev,
          totalXP: (prev.totalXP || 0) + result.rewardAmount
        }));

        console.log(`Claimed ${result.rewardAmount} XP!`);
      }
    } catch (error) {
      console.error("Failed to claim reward", error);
      alert("Could not claim reward. Please check your connection.");
    }
  };

  const handleViewAllBadges = () => {
    setIsAllBadgesModalVisible(true)
  }

  const renderCalendarDay = (dayInfo, index) => {
    if (!dayInfo.isCurrentMonth) {
      return (
        <View key={index} style={twrnc`w-[14.28%] aspect-square items-center justify-center opacity-30`}>
          {dayInfo.day && <CustomText style={twrnc`text-gray-500 text-[10px]`}>{dayInfo.day}</CustomText>}
        </View>
      )
    }
    const progressData =
      monthlyProgress.find((p) => p.date && p.date.toDateString() === dayInfo.date.toDateString()) || {
        progress: 0,
        completed: false,
        activities: [],
      }
    const isCompleted = progressData.completed
    const progress = progressData.progress
    const isToday = dayInfo.isToday
    const hasActivities = Array.isArray(progressData.activities) && progressData.activities.length > 0

    let bgColor = "bg-[#1e293b]"
    if (progress > 0 && progress < 1) {
      bgColor = "bg-[#4361EE]"
    } else if (hasActivities && !isCompleted) {
      bgColor = "bg-[#FFC107]"
    } else if (isCompleted) {
      bgColor = "bg-[#06D6A0]"
    }
    if (isToday && !isCompleted && progress > 0) {
      bgColor = "bg-[#4361EE]"
    }

    const accessibilityLabel = `Day ${dayInfo.day}, ${isToday ? "Today, " : ""}${Math.round(progress * 100)}% progress, ${isCompleted ? "goal completed" : hasActivities ? "activity recorded" : "no activity"
      }.`
    const accessibilityHint = `Double tap to view activities for ${formatDate(dayInfo.date)}.`

    return (
      <TouchableOpacity
        key={index}
        style={[twrnc`w-[14.28%] aspect-square items-center justify-center p-0.5`, { minWidth: 40, minHeight: 40 }]}
        activeOpacity={0.7}
        onPress={() => dayInfo.date && handleDaySelection(dayInfo.date)}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View
          style={twrnc`w-full h-full rounded-xl items-center justify-center
        ${bgColor}
        ${isToday ? "border-2 border-[#FFC107]" : ""}`}
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          ) : hasActivities ? (
            <View style={twrnc`items-center`}>
              <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-[10px]`}>
                {dayInfo.day}
              </CustomText>
              {progress > 0 && progress < 1 ? (
                <CustomText style={twrnc`text-white text-[8px]`}>{Math.round(progress * 100)}%</CustomText>
              ) : (
                <View style={twrnc`w-0.5 h-0.5 bg-white rounded-full mt-0.5`} />
              )}
            </View>
          ) : progress > 0 ? (
            <View style={twrnc`items-center`}>
              <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-[10px]`}>
                {dayInfo.day}
              </CustomText>
              <CustomText style={twrnc`text-white text-[8px]`}>{Math.round(progress * 100)}%</CustomText>
            </View>
          ) : (
            <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-xs`}>
              {dayInfo.day}
            </CustomText>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const handleDaySelection = async (date) => {
    try {
      setSelectedCalendarDate(date)
      setLoading(true)
      const user = auth.currentUser
      if (!user) {
        setError("Please sign in to view activities")
        setLoading(false)
        return
      }

      const storedSession = await AsyncStorage.getItem("userSession")
      const sessionData = safeParseJSON(storedSession, null)
      if (!sessionData?.uid || !sessionData.emailVerified || sessionData.uid !== user.uid) {
        setError("Invalid or expired session. Please sign in again.")
        setLoading(false)
        return
      }

      const startOfDayDate = new Date(date)
      startOfDayDate.setHours(0, 0, 0, 0)
      const endOfDayDate = new Date(date)
      endOfDayDate.setHours(23, 59, 59, 999)

      const activitiesRef = collection(db, "activities")
      const questActivitiesRef = collection(db, "quest_activities")
      const challengeActivitiesRef = collection(db, "challenge_activities")
      const normalActivitiesRef = collection(db, "normal_activities")

      const createDayQuery = (ref) =>
        query(ref, where("userId", "==", user.uid), where("createdAt", ">=", startOfDayDate), where("createdAt", "<=", endOfDayDate))

      const [activitiesSnap, questActivitiesSnap, challengeActivitiesSnap, normalActivitiesSnap] = await Promise.all([
        getDocs(createDayQuery(activitiesRef)),
        getDocs(createDayQuery(questActivitiesRef)),
        getDocs(createDayQuery(challengeActivitiesRef)),
        getDocs(createDayQuery(normalActivitiesRef)),
      ])

      const activitiesData = [
        ...activitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ...questActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ...challengeActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ...normalActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ]

      const detailedActivitiesData = activitiesData.map((docData) => ({
        id: docData.id,
        ...docData,
        distanceRaw: docData.distance || 0,
        durationSeconds: docData.duration || docData.durationSeconds || 0,
        reps: docData.reps || 0,
        sets: docData.sets || 1,
        pace: docData.pace || "0:00/km",
        avgSpeed: docData.avgSpeed || "0 km/h",

        displayInfo: getActivityDisplayInfo(docData),
        formattedTime: docData.createdAt?.toDate
          ? docData.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "",
      }))

      if (detailedActivitiesData.length > 0) {
        detailedActivitiesData.sort((a, b) => (b.createdAt?.toDate() || new Date()) - (a.createdAt?.toDate() || new Date()))
        setDateActivities(detailedActivitiesData)
      } else {
        setDateActivities([])
      }

      setIsDateActivitiesModalVisible(true)
      setLoading(false)
    } catch (err) {
      console.error("Error fetching day activities:", err)
      setError("Failed to load activities. Please try again.")
      setLoading(false)
    }
  }

  const navigateMonth = useCallback((direction) => {
    setCurrentMonthDate((prevDate) => {
      const newDate = new Date(prevDate)
      newDate.setMonth(prevDate.getMonth() + direction)
      return newDate
    })
  }, [])

  if (loading || questLoading) {
    return (
      <View style={twrnc`flex-1 bg-[#0f172a] justify-center items-center`}>
        <ActivityIndicator size="large" color="#4361EE" />
        <CustomText style={twrnc`text-white mt-4 text-sm`}>Loading Dashboard...</CustomText>
      </View>
    )
  }

  if (error) {
    return (
      <View style={twrnc`flex-1 bg-[#0f172a] justify-center items-center px-6`}>
        <View style={twrnc`bg-[#1e293b] rounded-2xl p-6 items-center w-full max-w-sm`}>
          <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-full p-4 mb-4`}>
            <Ionicons name="alert-circle" size={32} color="#EF476F" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-base mb-2 text-center`}>
            Something went wrong
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-xs text-center mb-6`}>{error}</CustomText>
          <TouchableOpacity style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl w-full`} onPress={fetchData}>
            <CustomText weight="bold" style={twrnc`text-white text-center text-sm`}>
              Try Again
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const todayQuest = dynamicQuests[0]

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      <ScrollView
        style={twrnc`flex-1`}
        contentContainerStyle={twrnc`pb-20`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE", "#FFC107"]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HEADER SECTION ===== */}
        <Animated.View
          style={[
            twrnc`px-5 pt-10 pb-5 relative overflow-hidden`,
            {
              backgroundColor: "#1e293b",
              opacity: headerFadeAnim,
              transform: [{ translateY: headerSlideAnim }],
            },
          ]}
        >
          {/* Decorative Pattern */}
          <Animated.View
            style={[
              twrnc`absolute top-0 right-0 w-32 h-32`,
              {
                opacity: 0.08,
                transform: [{ rotate: patternRotation }],
              },
            ]}
          >
            <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
              {[...Array(16)].map((_, i) => (
                <View key={i} style={[twrnc`w-1/4 h-1/4 border border-indigo-400`, { transform: [{ rotate: "45deg" }] }]} />
              ))}
            </View>
          </Animated.View>

          {/* Header Content */}
          <View style={twrnc`relative z-10`}>
            {/* Title with Brand Accent */}
            <View style={twrnc`mb-1.5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-5 bg-[#FFC107] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                  Your Progress
                </CustomText>
              </View>
            </View>

            {/* Level and XP Badges */}
            <View style={twrnc`flex-row items-center flex-wrap`}>
              <View style={twrnc`bg-[#4361EE] rounded-full px-3 py-1.5 mr-2 mb-1`}>
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="trophy" size={12} color="white" style={twrnc`mr-1.5`} />
                  <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                    Level {userStats.level}
                  </CustomText>
                </View>
              </View>
              <View style={twrnc`bg-[#FFC107] rounded-full px-3 py-1.5 mb-1`}>
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="star" size={12} color="#0f172a" style={twrnc`mr-1.5`} />
                  <CustomText weight="bold" style={twrnc`text-[#0f172a] text-xs`}>
                    {userStats.totalXP} XP
                  </CustomText>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={twrnc`px-5`}>
          <View style={twrnc`h-4`} />

          {/* ===== CALENDAR SECTION ===== */}
          <Animated.View
            style={[
              twrnc`mb-5`,
              {
                opacity: calendarFadeAnim,
              },
            ]}
          >
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 overflow-hidden relative`}>
              {/* Pattern */}
              <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`]}>
                <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                  {[...Array(16)].map((_, i) => (
                    <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#4361EE]`, { transform: [{ rotate: "45deg" }] }]} />
                  ))}
                </View>
              </View>

              <View style={twrnc`relative z-10`}>
                {/* Header with Title and Dropdown - ALWAYS VISIBLE */}
                <View style={twrnc`flex-row items-center justify-between mb-3`}>
                  <View style={twrnc`flex-row items-center`}>
                    <View style={twrnc`w-0.5 h-4 bg-[#4361EE] rounded-full mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                      {timePeriod === "week" ? "Weekly Progress" : "Monthly Progress"}
                    </CustomText>
                  </View>

                  {/* Time Period Dropdown */}
                  <View style={twrnc`relative`}>
                    <TouchableOpacity
                      style={twrnc`flex-row items-center bg-[#0f172a] rounded-full px-3 py-1.5 border border-gray-700`}
                      onPress={toggleTimeDropdown}
                    >
                      <CustomText style={twrnc`text-white text-xs mr-1.5`}>{timePeriod === "week" ? "Week" : "Month"}</CustomText>
                      <Ionicons name={isTimeDropdownVisible ? "chevron-up" : "chevron-down"} size={12} color="#FFFFFF" />
                    </TouchableOpacity>

                    {isTimeDropdownVisible && (
                      <View
                        style={twrnc`absolute top-9 right-0 bg-[#1e293b] rounded-xl shadow-lg z-50 w-24 overflow-hidden border border-gray-700`}
                      >
                        <TouchableOpacity
                          style={[twrnc`px-3 py-2`, timePeriod === "week" && twrnc`bg-[#4361EE]`]}
                          onPress={() => selectTimePeriod("week")}
                        >
                          <CustomText style={twrnc`text-white text-xs`}>Week</CustomText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[twrnc`px-3 py-2`, timePeriod === "month" && twrnc`bg-[#4361EE]`]}
                          onPress={() => selectTimePeriod("month")}
                        >
                          <CustomText style={twrnc`text-white text-xs`}>Month</CustomText>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {timePeriod === "week" ? (
                  // Week View
                  <View style={twrnc`flex-row justify-between mt-2`}>
                    {weekDates.map((day, index) => {
                      const progressData = weeklyProgress[index] || { progress: 0, completed: false, activities: [] }
                      const isCompleted = progressData.completed
                      const progress = progressData.progress
                      const hasActivities = Array.isArray(progressData.activities) && progressData.activities.length > 0

                      return (
                        <TouchableOpacity
                          key={index}
                          style={twrnc`items-center justify-center flex-1`}
                          activeOpacity={0.7}
                          onPress={() => day.date && handleDaySelection(day.date)}
                        >
                          <CustomText style={twrnc`text-gray-400 text-[9px] mb-1.5`}>{day.dayName}</CustomText>
                          <View
                            style={[
                              twrnc`w-9 h-9 rounded-xl items-center justify-center`,
                              isCompleted
                                ? twrnc`bg-[#06D6A0]`
                                : progress > 0
                                  ? twrnc`bg-[#4361EE]`
                                  : hasActivities
                                    ? twrnc`bg-[#FFC107]`
                                    : twrnc`bg-[#0f172a]`,
                              day.isToday && twrnc`border-2 border-[#FFC107]`,
                            ]}
                          >
                            {isCompleted ? (
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                            ) : progress > 0 ? (
                              <View style={twrnc`items-center`}>
                                <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-[9px]`}>
                                  {day.day}
                                </CustomText>
                                <CustomText style={twrnc`text-white text-[7px]`}>{Math.round(progress * 100)}%</CustomText>
                              </View>
                            ) : hasActivities ? (
                              <View style={twrnc`items-center`}>
                                <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-[9px]`}>
                                  {day.day}
                                </CustomText>
                                <View style={twrnc`w-0.5 h-0.5 bg-white rounded-full mt-0.5`} />
                              </View>
                            ) : (
                              <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-[10px]`}>
                                {day.day}
                              </CustomText>
                            )}
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ) : (
                  // Month View
                  <View>
                    {/* Month Navigation */}
                    <View style={twrnc`flex-row justify-between items-center mb-3 mt-2`}>
                      <TouchableOpacity onPress={() => navigateMonth(-1)} style={twrnc`p-1.5`}>
                        <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                      <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                        {getMonthYearString(currentMonthDate)}
                      </CustomText>
                      <TouchableOpacity onPress={() => navigateMonth(1)} style={twrnc`p-1.5`}>
                        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>

                    {/* Weekday Headers */}
                    <View style={twrnc`flex-row justify-between mb-2`}>
                      {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                        <View key={index} style={twrnc`w-[14.28%] items-center`}>
                          <CustomText style={twrnc`text-gray-400 text-[10px]`}>{day}</CustomText>
                        </View>
                      ))}
                    </View>

                    {/* Calendar Grid */}
                    <View style={twrnc`flex-row flex-wrap mb-3`}>{monthCalendar.map((day, index) => renderCalendarDay(day, index))}</View>

                    {/* Legend */}
                    <View style={twrnc`flex-row justify-center flex-wrap`}>
                      <View style={twrnc`flex-row items-center mx-1.5 my-0.5`}>
                        <View style={twrnc`w-2 h-2 rounded-full bg-[#1e293b] mr-1 border border-gray-700`} />
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>No Activity</CustomText>
                      </View>
                      <View style={twrnc`flex-row items-center mx-1.5 my-0.5`}>
                        <View style={twrnc`w-2 h-2 rounded-full bg-[#FFC107] mr-1`} />
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Activity</CustomText>
                      </View>
                      <View style={twrnc`flex-row items-center mx-1.5 my-0.5`}>
                        <View style={twrnc`w-2 h-2 rounded-full bg-[#4361EE] mr-1`} />
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>In Progress</CustomText>
                      </View>
                      <View style={twrnc`flex-row items-center mx-1.5 my-0.5`}>
                        <View style={twrnc`w-2 h-2 rounded-full bg-[#06D6A0] mr-1`} />
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Achieved</CustomText>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>


          {/* ===== TODAY'S STATS ===== */}
          <Animated.View
            style={[
              twrnc`mb-5`,
              {
                opacity: headerFadeAnim,
                transform: [{ translateY: statsSlideAnim }],
              },
            ]}
          >
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-5 overflow-hidden relative`}>
              {/* Pattern */}
              <View style={twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`}>
                <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                  {[...Array(16)].map((_, i) => (
                    <View
                      key={i}
                      style={[twrnc`w-[14px] h-[14px] border border-[#FFC107]`, { transform: [{ rotate: "45deg" }] }]}
                    />
                  ))}
                </View>
              </View>

              <View style={twrnc`relative z-10`}>
                {/* Header */}
                <View style={twrnc`flex-row items-center mb-3`}>
                  <View style={twrnc`w-0.5 h-4 bg-[#06D6A0] rounded-full mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                    Today's Activity
                  </CustomText>
                </View>

                {/* Stats Grid - 2x2 Layout */}
                <View style={twrnc`flex-row flex-wrap -mx-1`}>
                  {/* Distance */}
                  <View style={twrnc`w-1/2 px-1 mb-3`}>
                    <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-xl p-3`}>
                      <View style={twrnc`flex-row items-center mb-1`}>
                        <Ionicons name="location" size={18} color="#06D6A0" />
                        <CustomText style={twrnc`text-gray-400 text-[10px] ml-1.5`}>Distance</CustomText>
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        {activityData.distance}
                      </CustomText>
                    </View>
                  </View>

                  {/* Duration */}
                  <View style={twrnc`w-1/2 px-1 mb-3`}>
                    <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-xl p-3`}>
                      <View style={twrnc`flex-row items-center mb-1`}>
                        <Ionicons name="time" size={18} color="#FFC107" />
                        <CustomText style={twrnc`text-gray-400 text-[10px] ml-1.5`}>Active Time</CustomText>
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        {activityData.duration}
                      </CustomText>
                    </View>
                  </View>

                  {/* Calories */}
                  <View style={twrnc`w-1/2 px-1`}>
                    <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-xl p-3`}>
                      <View style={twrnc`flex-row items-center mb-1`}>
                        <Ionicons name="flame" size={18} color="#EF476F" />
                        <CustomText style={twrnc`text-gray-400 text-[10px] ml-1.5`}>Calories</CustomText>
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        {todaysTotals.calories || 0}
                      </CustomText>
                    </View>
                  </View>

                  {/* Pace */}
                  <View style={twrnc`w-1/2 px-1`}>
                    <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-xl p-3`}>
                      <View style={twrnc`flex-row items-center mb-1`}>
                        <Ionicons name="speedometer" size={18} color="#4361EE" />
                        <CustomText style={twrnc`text-gray-400 text-[10px] ml-1.5`}>Pace</CustomText>
                      </View>
                      <CustomText weight="bold" style={twrnc`text-sm text-white`}>
                        {activityData.stats.pace}
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>



          {/* ===== DAILY QUEST CARD ===== */}
          {todayQuest && (
            <Animated.View
              style={[
                {
                  transform: [{ scale: questScaleAnim }],
                  opacity: headerFadeAnim,
                },
              ]}
            >
              <View style={twrnc`bg-[#1e293b] rounded-2xl p-5 mb-5 overflow-hidden relative`}>
                {/* Pattern */}
                <View style={[twrnc`absolute top-0 right-0 w-32 h-32`, { opacity: 0.1 }]}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#4361EE]`, { transform: [{ rotate: "45deg" }] }]} />
                    ))}
                  </View>
                </View>

                <View style={twrnc`relative z-10`}>
                  {/* Quest Header */}
                  <View style={twrnc`flex-row items-center justify-between mb-3`}>
                    <View style={twrnc`flex-row items-center flex-1`}>
                      <View style={twrnc`bg-[#4361EE] rounded-xl p-2.5 mr-3`}>
                        <Ionicons
                          name={
                            todayQuest.category === "endurance"
                              ? "flash"
                              : todayQuest.category === "fitness"
                                ? "heart"
                                : todayQuest.category === "strength"
                                  ? "barbell"
                                  : todayQuest.category === "flexibility"
                                    ? "body"
                                    : "trophy"
                          }
                          size={20}
                          color="white"
                        />
                      </View>
                      <View style={twrnc`flex-1`}>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {todayQuest.title}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[10px]`}>{todayQuest.description}</CustomText>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setIsQuestModalVisible(true)} style={twrnc`p-1.5`}>
                      <Ionicons name="list" size={20} color="#FFC107" />
                    </TouchableOpacity>
                  </View>

                  {/* Progress Section */}
                  <View style={twrnc`mb-3`}>
                    <View style={twrnc`flex-row justify-between items-center mb-1.5`}>
                      <CustomText style={twrnc`text-gray-400 text-[10px]`}>Progress</CustomText>
                      <View style={twrnc`flex-row items-center`}>
                        <CustomText weight="bold" style={twrnc`text-white text-xs mr-1`}>
                          {getCurrentQuestValue(todayQuest).toFixed(todayQuest.unit === "distance" ? 2 : 0)}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[10px]`}>
                          / {todayQuest.goal} {todayQuest.unit === "distance" ? "km" : todayQuest.unit === "duration" ? "min" : "reps"}
                        </CustomText>
                      </View>
                    </View>


                    {/* Progress Bar */}
                    <View style={twrnc`h-2 bg-[#0f172a] rounded-full overflow-hidden`}>
                      <View
                        style={[
                          twrnc`h-full rounded-full`,
                          {
                            width: `${Math.min(calculateQuestProgress(todayQuest) * 100, 100)}%`,
                            backgroundColor: calculateQuestProgress(todayQuest) >= 1 ? "#06D6A0" : "#4361EE",
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Reward and Action */}
                  <View style={twrnc`flex-row items-center justify-between`}>
                    <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-full px-3 py-1.5`}>
                      <View style={twrnc`flex-row items-center`}>
                        <Ionicons name="star" size={12} color="#FFC107" style={twrnc`mr-1`} />
                        <CustomText weight="bold" style={twrnc`text-[#FFC107] text-xs`}>
                          +{todayQuest.xpReward} XP
                        </CustomText>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={twrnc`bg-[#4361EE] rounded-full px-5 py-2.5`}
                      onPress={() => navigateToQuestActivity(todayQuest)}
                      activeOpacity={0.8}
                    >
                      <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                        Start Quest
                      </CustomText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Badge Section */}
          <BadgeSection
            badges={allBadges}
            onViewAll={handleViewAllBadges}
            onBadgePress={handleBadgePress}
          />
        </View>
      </ScrollView>


      {/* ===== MODALS ===== */}
      {/* Quest List Modal */}
      <Modal animationType="slide" transparent={true} visible={isQuestModalVisible} onRequestClose={() => setIsQuestModalVisible(false)}>
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-4/5`}>
            <View style={twrnc`flex-row justify-between items-start mb-5`}>
              <View style={twrnc`flex-1 pr-3`}>
                <View style={twrnc`flex-row items-center mb-1`}>
                  <View style={twrnc`w-1 h-5 bg-[#FFC107] rounded-full mr-2.5`} />
                  <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                    Daily Quests
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-xs ml-4`}>Personalized challenges based on your performance</CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={() => setIsQuestModalVisible(false)}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={twrnc`pb-3`}>
              {dynamicQuests.length > 0 ? (
                dynamicQuests.map((quest, index) => {
                  const progress = calculateQuestProgress(quest)
                  const status = getQuestStatus(quest)
                  const isCompleted = status === "completed"

                  return (
                    <View key={quest.id || index} style={twrnc`bg-[#0f172a] rounded-2xl p-4 mb-3 shadow-lg border border-gray-700/50`}>
                      <View style={twrnc`flex-row items-start mb-3`}>
                        <View style={[twrnc`rounded-xl p-2.5 mr-3`, isCompleted ? twrnc`bg-[#06D6A0]` : twrnc`bg-[#4361EE]`]}>
                          <Ionicons
                            name={
                              quest.category === "endurance"
                                ? "flash-outline"
                                : quest.category === "fitness"
                                  ? "heart-outline"
                                  : quest.category === "strength"
                                    ? "barbell-outline"
                                    : quest.category === "flexibility"
                                      ? "body-outline"
                                      : "trophy-outline"
                            }
                            size={18}
                            color="#FFFFFF"
                          />
                        </View>

                        <View style={twrnc`flex-1`}>
                          <View style={twrnc`flex-row items-center justify-between mb-1`}>
                            <CustomText weight="bold" style={twrnc`text-white text-sm flex-shrink mr-2`} numberOfLines={1}>
                              {quest.title}
                            </CustomText>
                            <View style={twrnc`bg-[#FFC107] rounded-full px-2 py-0.5`}>
                              <CustomText style={twrnc`text-[#0f172a] text-[10px] font-bold`}>+{quest.xpReward} XP</CustomText>
                            </View>
                          </View>

                          <CustomText style={twrnc`text-gray-400 text-xs mb-2`} numberOfLines={2}>
                            {quest.description}
                          </CustomText>

                          <View style={twrnc`flex-row flex-wrap gap-1.5`}>
                            <View style={twrnc`bg-[#2A2E3A] rounded-full px-2.5 py-1`}>
                              <CustomText style={twrnc`text-white text-[9px]`}>
                                {quest.difficulty.charAt(0).toUpperCase() + quest.difficulty.slice(1)}
                              </CustomText>
                            </View>
                            <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-full px-2.5 py-1`}>
                              <CustomText style={twrnc`text-[#4361EE] text-[9px]`}>
                                {quest.category.charAt(0).toUpperCase() + quest.category.slice(1)}
                              </CustomText>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={twrnc`mb-3`}>
                        <View style={twrnc`flex-row justify-between items-center mb-1.5`}>
                          <CustomText style={twrnc`text-gray-400 text-[9px]`}>Progress</CustomText>
                          <CustomText style={[twrnc`text-[10px] font-medium`, isCompleted ? twrnc`text-[#06D6A0]` : twrnc`text-[#FFC107]`]}>
                            {Math.round(progress * 100)}%
                          </CustomText>
                        </View>
                        <View style={twrnc`h-1.5 bg-[#2A2E3A] rounded-full overflow-hidden`}>
                          <View
                            style={[
                              twrnc`h-1.5 rounded-full`,
                              {
                                width: `${progress * 100}%`,
                                backgroundColor: isCompleted ? "#06D6A0" : "#4361EE",
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <TouchableOpacity
                        style={twrnc`rounded-xl py-3 items-center justify-center flex-row ${isCompleted ? "bg-[#06D6A0]" : "bg-[#4361EE]"
                          }`}
                        onPress={() => !isCompleted && navigateToQuestActivity(quest)}
                        disabled={isCompleted}
                      >
                        {isCompleted && <Ionicons name="checkmark" size={16} color="#FFFFFF" style={twrnc`mr-1.5`} />}
                        <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                          {isCompleted ? "Quest Completed" : "Start Quest"}
                        </CustomText>
                      </TouchableOpacity>
                    </View>
                  )
                })
              ) : (
                <View style={twrnc`items-center justify-center py-12`}>
                  <View style={twrnc`bg-[#0f172a] p-5 rounded-2xl mb-4`}>
                    <Ionicons name="trophy-outline" size={40} color="#6B7280" />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-gray-300 text-base mb-2 text-center`}>
                    No Quests Available
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-center text-xs`}>
                    Complete more activities to unlock personalized quests!
                  </CustomText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Activity Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isActivityModalVisible}
        onRequestClose={() => setIsActivityModalVisible(false)}
      >
        <Pressable style={twrnc`flex-1 bg-black/70 justify-end`} onPress={() => setIsActivityModalVisible(false)}>
          <View style={twrnc`max-h-4/5 bg-[#1e293b] rounded-t-3xl`}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={twrnc`p-5`}>
                <View style={twrnc`flex-row justify-between items-center mb-5`}>
                  <View style={twrnc`flex-row items-center`}>
                    <View style={twrnc`w-1 h-5 bg-[#06D6A0] rounded-full mr-2.5`} />
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      Activity Details
                    </CustomText>
                  </View>
                  <TouchableOpacity
                    style={twrnc`bg-[#0f172a] p-2 rounded-xl`}
                    onPress={() => setIsActivityModalVisible(false)}
                  >
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {selectedActivity?.coordinates?.length > 0 ? (
                  <View style={twrnc`w-full h-56 rounded-2xl overflow-hidden mb-5 border border-gray-700`}>
                    <MapView
                      style={twrnc`w-full h-full`}
                      initialRegion={calculateMapRegion(selectedActivity.coordinates)}
                      provider={PROVIDER_GOOGLE}
                      scrollEnabled={true}
                      zoomEnabled={true}
                      pitchEnabled={false}
                      rotateEnabled={false}
                    >
                      <Polyline
                        coordinates={selectedActivity.coordinates}
                        strokeColor="#4361EE"
                        strokeWidth={4}
                        lineCap="round"
                        lineJoin="round"
                      />
                    </MapView>

                    <View style={twrnc`absolute top-3 left-3 bg-[#1e293b] bg-opacity-80 rounded-full px-3 py-1`}>
                      <CustomText style={twrnc`text-white text-xs font-medium`}>
                        {selectedActivity.activityType?.charAt(0).toUpperCase() +
                          selectedActivity.activityType?.slice(1) || "Activity"}
                      </CustomText>
                    </View>

                    {/* Calories Badge on Map */}
                    {selectedActivity.calories > 0 && (
                      <View style={twrnc`absolute top-3 right-3 bg-[#EF476F] bg-opacity-90 rounded-full px-3 py-1 flex-row items-center`}>
                        <Ionicons name="flame" size={12} color="#FFFFFF" style={twrnc`mr-1`} />
                        <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                          {selectedActivity.calories} cal
                        </CustomText>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={twrnc`w-full h-32 bg-[#0f172a] justify-center items-center rounded-2xl mb-5 border border-dashed border-gray-600`}>
                    <Ionicons name="map-outline" size={32} color="#6B7280" style={twrnc`mb-1.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs text-center`}>
                      No route data available
                    </CustomText>
                  </View>
                )}

                {selectedActivity &&
                  (() => {
                    const displayInfo = getActivityDisplayInfo(selectedActivity)
                    const calories = selectedActivity.calories || 0

                    return (
                      <View style={twrnc`bg-[#0f172a] rounded-2xl p-4 mb-5`}>
                        <CustomText weight="bold" style={twrnc`text-white text-base mb-3`}>
                          Activity Summary
                        </CustomText>

                        {/* Main 3 Stats */}
                        <View style={twrnc`flex-row justify-between mb-4`}>
                          <View style={twrnc`items-center flex-1`}>
                            <Ionicons
                              name={displayInfo.primaryMetric.icon}
                              size={14}
                              color="#9CA3AF"
                              style={twrnc`mb-0.5`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                              {displayInfo.primaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-lg`, { color: displayInfo.primaryMetric.color }]}
                            >
                              {displayInfo.primaryMetric.value}
                            </CustomText>
                          </View>

                          <View style={twrnc`items-center flex-1 border-l border-r border-gray-700`}>
                            <Ionicons
                              name={displayInfo.secondaryMetric.icon}
                              size={14}
                              color="#9CA3AF"
                              style={twrnc`mb-0.5`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                              {displayInfo.secondaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-lg`, { color: displayInfo.secondaryMetric.color }]}
                            >
                              {displayInfo.secondaryMetric.value}
                            </CustomText>
                          </View>

                          <View style={twrnc`items-center flex-1`}>
                            <Ionicons
                              name={displayInfo.tertiaryMetric.icon}
                              size={14}
                              color="#9CA3AF"
                              style={twrnc`mb-0.5`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                              {displayInfo.tertiaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-lg`, { color: displayInfo.tertiaryMetric.color }]}
                            >
                              {displayInfo.tertiaryMetric.value}
                            </CustomText>
                          </View>
                        </View>

                        {/* Calories Row */}
                        {calories > 0 && (
                          <View style={twrnc`bg-[#EF476F] bg-opacity-10 rounded-xl p-3 mb-4 border border-[#EF476F] border-opacity-20`}>
                            <View style={twrnc`flex-row items-center justify-between`}>
                              <View style={twrnc`flex-row items-center`}>
                                <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-full p-2 mr-3`}>
                                  <Ionicons name="flame" size={20} color="#EF476F" />
                                </View>
                                <View>
                                  <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                                    Calories Burned
                                  </CustomText>
                                  <CustomText weight="bold" style={twrnc`text-[#EF476F] text-xl`}>
                                    {calories}
                                  </CustomText>
                                </View>
                              </View>
                              <CustomText style={twrnc`text-[#EF476F] text-xs`}>
                                kcal
                              </CustomText>
                            </View>
                          </View>
                        )}

                        {/* Activity Type & Date */}
                        <View style={twrnc`flex-row justify-between`}>
                          <View style={twrnc`flex-1 mr-3`}>
                            <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                              Activity Type
                            </CustomText>
                            <View style={twrnc`flex-row items-center`}>
                              <Ionicons name="fitness" size={14} color="#FFFFFF" style={twrnc`mr-1.5`} />
                              <CustomText style={twrnc`text-white text-xs`}>
                                {selectedActivity.activityType?.charAt(0).toUpperCase() +
                                  selectedActivity.activityType?.slice(1) || "Unknown"}
                              </CustomText>
                            </View>
                          </View>

                          <View style={twrnc`flex-1`}>
                            <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>
                              Date
                            </CustomText>
                            <View style={twrnc`flex-row items-center`}>
                              <Ionicons name="calendar-outline" size={14} color="#FFFFFF" style={twrnc`mr-1.5`} />
                              <CustomText style={twrnc`text-white text-xs`} numberOfLines={1}>
                                {(() => {
                                  const raw = selectedActivity.createdAt
                                  const created = raw?.toDate
                                    ? raw.toDate()
                                    : raw instanceof Date
                                      ? raw
                                      : typeof raw === "number" || typeof raw === "string"
                                        ? new Date(raw)
                                        : null
                                  return created ? formatDate(created) : "Unknown date"
                                })()}
                              </CustomText>
                            </View>
                          </View>
                        </View>
                      </View>
                    )
                  })()}

                <View style={twrnc`flex-row gap-2.5`}>
                  <TouchableOpacity
                    style={twrnc`border border-[#EF476F] rounded-xl py-3 flex-1 flex-row items-center justify-center`}
                    onPress={clearActivity}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF476F" style={twrnc`mr-1.5`} />
                    <CustomText weight="bold" style={twrnc`text-[#EF476F] text-xs`}>
                      Clear Activity
                    </CustomText>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>


      {/* Date Activities Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDateActivitiesModalVisible}
        onRequestClose={() => setIsDateActivitiesModalVisible(false)}
      >
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-4/5`}>
            <View style={twrnc`flex-row justify-between items-start mb-5`}>
              <View style={twrnc`flex-1 pr-3`}>
                <View style={twrnc`flex-row items-center mb-1`}>
                  <View style={twrnc`w-1 h-5 bg-[#FFC107] rounded-full mr-2.5`} />
                  <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                    {formatDate(selectedCalendarDate)}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-xs ml-4`}>
                  Track your activities and performance for this day
                </CustomText>
              </View>
              <TouchableOpacity
                style={twrnc`bg-[#0f172a] p-2 rounded-xl`}
                onPress={() => setIsDateActivitiesModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={twrnc`pb-3`}>
              {dateActivities.length > 0 ? (
                dateActivities.map((activity, index) => {
                  const displayInfo = activity.displayInfo || getActivityDisplayInfo(activity)
                  const calories = activity.calories || 0

                  return (
                    <View
                      key={index}
                      style={twrnc`bg-[#0f172a] rounded-2xl p-4 mb-3 shadow-lg border border-gray-700/50`}
                    >
                      {/* Header with Activity Type and Time */}
                      <View style={twrnc`flex-row justify-between items-center mb-3`}>
                        <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                          {activity.activityType.charAt(0).toUpperCase() + activity.activityType.slice(1)}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-xs`}>
                          {activity.formattedTime}
                        </CustomText>
                      </View>

                      {/* Calories Badge */}
                      {calories > 0 && (
                        <View style={twrnc`flex-row items-center bg-[#EF476F] bg-opacity-20 rounded-lg px-2.5 py-1.5 mb-3 self-start`}>
                          <Ionicons name="flame" size={14} color="#EF476F" style={twrnc`mr-1`} />
                          <CustomText weight="bold" style={twrnc`text-[#EF476F] text-xs`}>
                            {calories} cal burned
                          </CustomText>
                        </View>
                      )}

                      {/* Map View */}
                      {activity.coordinates && activity.coordinates.length > 0 && (
                        <View style={twrnc`h-28 rounded-xl overflow-hidden mb-3`}>
                          <MapView
                            style={twrnc`w-full h-full`}
                            initialRegion={calculateMapRegion(activity.coordinates)}
                            scrollEnabled={false}
                            zoomEnabled={false}
                            pitchEnabled={false}
                            rotateEnabled={false}
                          >
                            <Polyline
                              coordinates={activity.coordinates}
                              strokeColor="#4361EE"
                              strokeWidth={3}
                            />
                          </MapView>
                        </View>
                      )}

                      {/* Stats Row */}
                      <View style={twrnc`flex-row justify-between mb-4`}>
                        {[
                          displayInfo.primaryMetric,
                          displayInfo.secondaryMetric,
                          displayInfo.tertiaryMetric
                        ].map((metric, idx) => (
                          <View key={idx} style={twrnc`items-center flex-1`}>
                            <View style={twrnc`flex-row items-center mb-0.5`}>
                              <Ionicons
                                name={metric.icon}
                                size={12}
                                color={metric.color}
                                style={twrnc`mr-1`}
                              />
                              <CustomText style={twrnc`text-gray-400 text-[9px]`}>
                                {metric.label}
                              </CustomText>
                            </View>
                            <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                              {metric.value}
                            </CustomText>
                          </View>
                        ))}
                      </View>

                      {/* View Details Button */}
                      <TouchableOpacity
                        style={twrnc`bg-[#4361EE] rounded-xl py-2.5 items-center flex-row justify-center`}
                        onPress={() => {
                          setIsDateActivitiesModalVisible(false)
                          viewActivityDetails(activity)
                        }}
                      >
                        <Ionicons name="eye-outline" size={16} color="#FFFFFF" style={twrnc`mr-1.5`} />
                        <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                          View Details
                        </CustomText>
                      </TouchableOpacity>
                    </View>
                  )
                })
              ) : (
                <View style={twrnc`items-center justify-center py-12`}>
                  <View style={twrnc`bg-[#0f172a] p-5 rounded-2xl mb-4`}>
                    <Ionicons name="calendar-outline" size={40} color="#6B7280" />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-gray-300 text-base mb-2 text-center`}>
                    No Activities Found
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-center text-xs`}>
                    Add or complete activities to track your progress!
                  </CustomText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Badge Modals */}
      <BadgeModal
        visible={isBadgeDetailModalVisible}
        badge={selectedBadge}
        onClose={() => setIsBadgeDetailModalVisible(false)}
        onClaim={handleClaimReward} // PASSED PROP
      />

      <BadgeNotification visible={isBadgeNotificationVisible} badges={newlyEarnedBadges} onClose={() => setIsBadgeNotificationVisible(false)} />

      <AllBadgesModal
        visible={isAllBadgesModalVisible}
        badges={allBadges}
        onClose={() => setIsAllBadgesModalVisible(false)}
        onBadgePress={handleBadgePress}
      />

    </View>
  )
}

export default DashboardScreen
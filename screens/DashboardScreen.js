"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Dimensions,
  StyleSheet,
  Pressable,
} from "react-native"

import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps"
import AsyncStorage from "@react-native-async-storage/async-storage"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import * as Location from "expo-location"
import { getDocs, collection, query, where, onSnapshot, doc } from "firebase/firestore"
import { db, auth } from "../firebaseConfig"
import { formatTime, unifyUnits} from "../utils/activityUtils"
import { QuestProgressManager } from "../utils/QuestProgressManager"

// Badge System Imports - Keep imports, but remove usage on dashboard
import { getUserQuestHistory } from "./BadgeSystem"
import { BadgeModal, BadgeNotification, AllBadgesModal } from "../components/BadgeComponents"

const { width } = Dimensions.get("window")

// Helper function to safely parse JSON
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
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const dayName = days[date.getDay()]
  const day = date.getDate()
  const month = months[date.getMonth()]
  return `${dayName}, ${day} ${month}`
}

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
      isToday: date.toDateString() === today.toDateString(),
      date: date,
    })
  }
  return weekDates
}

// Enhanced function to get month calendar data
const getMonthCalendar = (year, month) => {
  const today = new Date()
  const firstDayOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const firstDayWeekday = firstDayOfMonth.getDay() // 0 = Sunday, 6 = Saturday

  const calendarDays = []

  // Add empty slots for days before the 1st of the month
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push({ day: null, isCurrentMonth: false, date: null })
  }

  // Add days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    calendarDays.push({
      day: day,
      isToday: date.toDateString() === today.toDateString(),
      isCurrentMonth: true,
      date: date,
    })
  }

  // Fill remaining slots in the grid (if needed)
  const remainingSlots = 42 - calendarDays.length // 6 rows x 7 columns = 42
  if (remainingSlots > 0 && remainingSlots < 7) {
    for (let i = 1; i <= remainingSlots; i++) {
      calendarDays.push({ day: i, isCurrentMonth: false, date: new Date(year, month + 1, i) })
    }
  }
  return calendarDays
}

// Get month name and year for display
const getMonthYearString = (date) => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  return `${months[date.getMonth()]} ${date.getFullYear()}`
}

// Enhanced Dynamic Quest Generator with distance-based quests
const generateDynamicQuests = (userStats, userLevel = 1, preferences = {}) => {
  const baseQuests = [
    {
      id: "daily_distance",
      type: "daily",
      title: "Daily Distance Challenge",
      description: "Reach your daily distance goal",
      unit: "distance",
      goal: Math.max(2, userStats.avgDailyDistance * 1.1), // 10% more than average in km
      difficulty: "easy",
      xpReward: 50,
      category: "fitness",
      activityType: "walking",
    },
    {
      id: "distance_goal",
      type: "daily",
      title: "Distance Explorer",
      description: "Cover your target distance today",
      unit: "distance",
      goal: Math.max(3, userStats.avgDailyDistance * 1.2), // 20% more than average in km
      difficulty: "medium",
      xpReward: 75,
      category: "endurance",
      activityType: "running",
    },
    {
      id: "active_minutes",
      type: "daily",
      title: "Stay Active",
      description: "Maintain activity for the target duration",
      unit: "duration",
      goal: Math.max(30, userStats.avgActiveDuration * 1.15), // 15% more than average
      difficulty: "medium",
      xpReward: 60,
      category: "consistency",
      activityType: "jogging",
    },
    {
      id: "strength_builder",
      type: "daily",
      title: "Strength Builder",
      description: "Complete your strength training reps",
      unit: "reps",
      goal: Math.max(20, userStats.avgDailyReps * 1.3), // 30% more than average
      difficulty: "hard",
      xpReward: 80,
      category: "strength",
      activityType: "pushup",
    },
    {
      id: "cycling_challenge",
      type: "daily",
      title: "Cycling Adventure",
      description: "Complete a cycling session",
      unit: "distance",
      goal: Math.max(5, userStats.avgDailyDistance * 1.5), // 50% more for cycling in km
      difficulty: "medium",
      xpReward: 70,
      category: "endurance",
      activityType: "cycling",
    },
    {
      id: "flexibility_focus",
      type: "daily",
      title: "Flexibility Focus",
      description: "Complete stretching or yoga session",
      unit: "duration",
      goal: Math.max(15, userStats.avgActiveDuration * 0.5), // Shorter duration for flexibility
      difficulty: "easy",
      xpReward: 40,
      category: "flexibility",
      activityType: "yoga",
    },
  ]
  // Add level-based multipliers
  const levelMultiplier = 1 + (userLevel - 1) * 0.1
  return baseQuests.map((quest) => ({
    ...quest,
    goal: Math.round(quest.goal * levelMultiplier * 100) / 100, // Keep 2 decimal places for distance
    xpReward: Math.round(quest.xpReward * levelMultiplier),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  }))
}

// Enhanced function to get activity display info based on type
const getActivityDisplayInfo = (activity) => {
  const activityType = activity.activityType || "unknown"

  // Distance-based activities
  if (["walking", "running", "jogging", "cycling"].includes(activityType)) {
    // ✅ Convert meters → km before displaying
    const distanceKm = activity.distance ? (Number(activity.distance) / 1000).toFixed(2) : "0.00"

    return {
      primaryMetric: {
        label: "Distance",
        value: `${distanceKm} km`,
        icon: "map-outline",
        color: "#06D6A0",
      },
      secondaryMetric: {
        label: "Duration",
        value: activity.duration
          ? typeof activity.duration === "number"
            ? formatTime(activity.duration)
            : activity.duration
          : "0:00",
        icon: "time-outline",
        color: "#FFC107",
      },
      tertiaryMetric: {
        label: activityType === "cycling" ? "Speed" : "Pace",
        value:
          activityType === "cycling"
            ? activity.avgSpeed
              ? `${Number.parseFloat(activity.avgSpeed).toFixed(1)} km/h`
              : "0 km/h"
            : activity.pace
              ? typeof activity.pace === "number"
                ? formatTime(activity.pace) + "/km"
                : activity.pace
              : "0:00/km",
        icon: "speedometer-outline",
        color: "#4361EE",
      },
    }
  }

  // Strength-based activities
  if (["pushup", "pullup", "squat", "plank", "situp"].includes(activityType)) {
    return {
      primaryMetric: {
        label: activityType === "plank" ? "Duration" : "Reps",
        value:
          activityType === "plank"
            ? activity.duration
              ? typeof activity.duration === "number"
                ? formatTime(activity.duration)
                : activity.duration
              : "0:00"
            : activity.reps
              ? activity.reps.toString()
              : "0",
        icon: activityType === "plank" ? "time-outline" : "fitness-outline",
        color: "#EF476F",
      },
      secondaryMetric: {
        label: "Sets",
        value: activity.sets ? activity.sets.toString() : "1",
        icon: "repeat-outline",
        color: "#FFC107",
      },
      tertiaryMetric: {
        label: "Total Time",
        value: activity.duration
          ? typeof activity.duration === "number"
            ? formatTime(activity.duration)
            : activity.duration
          : "0:00",
        icon: "stopwatch-outline",
        color: "#4361EE",
      },
    }
  }

  // Flexibility/Yoga activities
  if (["yoga", "stretching", "meditation"].includes(activityType)) {
    return {
      primaryMetric: {
        label: "Duration",
        value: activity.duration
          ? typeof activity.duration === "number"
            ? formatTime(activity.duration)
            : activity.duration
          : "0:00",
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

  // Default fallback for unknown activity types
  return {
    primaryMetric: {
      label: "Duration",
      value: activity.duration
        ? typeof activity.duration === "number"
          ? formatTime(activity.duration)
          : activity.duration
        : "0:00",
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
  // Get responsive dimensions
  const { width, height } = Dimensions.get("window")
  const isSmallDevice = width < 375 // iPhone SE and similar small Android devices
  const isMediumDevice = width >= 375 && width < 414 // Standard phones
  const isLargeDevice = width >= 414 // Large phones

  // Responsive font sizes
  const responsiveFontSizes = {
    xs: isSmallDevice ? 10 : isMediumDevice ? 11 : 12,
    sm: isSmallDevice ? 12 : isMediumDevice ? 13 : 14,
    base: isSmallDevice ? 14 : isMediumDevice ? 15 : 16,
    lg: isSmallDevice ? 16 : isMediumDevice ? 18 : 20,
    xl: isSmallDevice ? 18 : isMediumDevice ? 20 : 22,
    "2xl": isSmallDevice ? 20 : isMediumDevice ? 22 : 24,
  }

  // Responsive padding/margin
  const responsivePadding = {
    base: isSmallDevice ? 3 : isMediumDevice ? 4 : 5,
    lg: isSmallDevice ? 4 : isMediumDevice ? 5 : 6,
  }

  const [activityData, setActivityData] = useState({
    coordinates: [],
    distance: "0 km",
    duration: "0:00",
    steps: 0,
    activityType: "walking",
    stats: { pace: "0:00/km", avgSpeed: "0 km/h" },
  })
  const [userLocation, setUserLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Dynamic Quest States
  const [dynamicQuests, setDynamicQuests] = useState([])
  const [userStats, setUserStats] = useState({
    avgDailySteps: userData.avgDailySteps || 5000,
    avgDailyDistance: userData.avgDailyDistance || 2.5, // in kilometers
    avgActiveDuration: userData.avgActiveDuration || 45,
    avgDailyReps: userData.avgDailyReps || 20, // Added for strength quests
    level: userData.level || 1,
    totalXP: userData.totalXP || 0,
  })
  const [questLoading, setQuestLoading] = useState(true)
  const [weeklyProgress, setWeeklyProgress] = useState([])
  const [monthlyProgress, setMonthlyProgress] = useState([])
  const [isQuestModalVisible, setIsQuestModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isDateActivitiesModalVisible, setIsDateActivitiesModalVisible] = useState(false)
  const [dateActivities, setDateActivities] = useState([])
  const [questHistory, setQuestHistory] = useState([])
  // const [isAllBadgesModalVisible, setIsAllBadgesModalVisible] = useState(false);

  const [periodStats, setPeriodStats] = useState({
    avgDailySteps: 0,
    avgDailyDistance: 0,
    avgActiveDuration: 0,
    avgDailyReps: 0,
  })

  // Normalize Firestore timestamp or JS Date to a JS Date
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

  // Convert a distance that may be meters or km to kilometers for display
  const toKm = (val) => {
    const n = typeof val === "string" ? Number.parseFloat(val) : typeof val === "number" ? val : 0
    if (!isFinite(n)) return 0
    return n / 1000
  }

  const toSeconds = (duration) => {
    if (typeof duration === "number") return isFinite(duration) ? duration : 0
    if (typeof duration === "string") {
      const parts = duration.split(":").map((p) => Number.parseInt(p, 10) || 0)
      if (parts.length === 3) return parts * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts * 60 + parts[1]
    }
    return 0
  }

  const formatKm = (km) => `${(km || 0).toFixed(2)} km`

  // Time period dropdown state - KEPT FOR DATA AGGREGATION
  const [timePeriod, setTimePeriod] = useState("week") // 'week' or 'month'
  const [isTimeDropdownVisible, setIsTimeDropdownVisible] = useState(false)

  // New state for activity details modal
  const [isActivityModalVisible, setIsActivityModalVisible] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState(null)

  // Calendar State for month navigation
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date()) // For month navigation
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date()) // For highlighting selected day

  const weekDates = useMemo(() => getWeekDates(), [])
  const monthCalendar = useMemo(
    () => getMonthCalendar(currentMonthDate.getFullYear(), currentMonthDate.getMonth()),
    [currentMonthDate],
  )

  // Initialize user data from AsyncStorage
  const initializeUserData = useCallback(async () => {
    const defaultUserStats = {
      avgDailySteps: 5000,
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

      // Check if session is valid and matches current user
      const isValidSession =
        sessionData?.uid &&
        sessionData.emailVerified &&
        (auth.currentUser ? auth.currentUser.uid === sessionData.uid : true)

      if (isValidSession) {
        setUserStats({
          avgDailySteps: userDataParsed.avgDailySteps || defaultUserStats.avgDailySteps,
          avgDailyDistance: userDataParsed.avgDailyDistance || defaultUserStats.avgDailyDistance,
          avgActiveDuration: userDataParsed.avgActiveDuration || defaultUserStats.avgActiveDuration,
          avgDailyReps: userDataParsed.avgDailyReps || defaultUserStats.avgDailyReps,
          level: userDataParsed.level || defaultUserStats.level,
          totalXP: userDataParsed.totalXP || defaultUserStats.totalXP,
        })
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
        setUserLocation(location.coords)
      } catch (err) {
        console.error("Location error:", err.message)
        setError("Failed to get location. Please ensure location services are enabled.")
      }
    }
    getUserLocation()
    initializeUserData()
  }, [initializeUserData])

  // Add this useEffect to sync userStats with userData prop
  useEffect(() => {
    if (userData && (userData.level || userData.totalXP)) {
      setUserStats(prevStats => ({
        ...prevStats,
        avgDailySteps: userData.avgDailySteps || prevStats.avgDailySteps,
        avgDailyDistance: userData.avgDailyDistance || prevStats.avgDailyDistance,
        avgActiveDuration: userData.avgActiveDuration || prevStats.avgActiveDuration,
        avgDailyReps: userData.avgDailyReps || prevStats.avgDailyReps,
        level: userData.level || prevStats.level,
        totalXP: userData.totalXP || prevStats.totalXP,
      }));
    }
  }, [userData]); // Re-run when userData prop changes


  // Enhanced Calculate user statistics from historical data
  const calculateUserStats = (activitiesData) => {
    if (!Array.isArray(activitiesData) || activitiesData.length === 0) {
      return {
        avgDailySteps: 5000,
        avgDailyDistance: 2.5, // in kilometers
        avgActiveDuration: 45,
        avgDailyReps: 20, // Default for strength activities
        level: 1,
        totalXP: 0,
      }
    }

    const totalSteps = activitiesData.reduce((sum, act) => sum + (Number(act.steps) || 0), 0)
    const totalDistance = activitiesData.reduce((sum, act) => sum + (Number(act.distance) || 0), 0) // in kilometers
    const totalDuration = activitiesData.reduce((sum, act) => sum + (Number(act.duration) || 0), 0)
    const totalReps = activitiesData.reduce((sum, act) => sum + (Number(act.reps) || 0), 0) // Added reps calculation

    // Get unique days to calculate daily averages
    const uniqueDays = new Set(
      activitiesData
        .map((act) => (act.createdAt?.toDate ? act.createdAt.toDate().toDateString() : new Date().toDateString()))
        .filter(Boolean),
    ).size

    const avgDailySteps = Math.round(totalSteps / Math.max(uniqueDays, 1))
    const avgDailyDistance = Number((totalDistance / Math.max(uniqueDays, 1)).toFixed(2)) // in kilometers
    const avgActiveDuration = Math.round(totalDuration / Math.max(activitiesData.length, 1))
    const avgDailyReps = Math.round(totalReps / Math.max(uniqueDays, 1)) // Added reps average

    // Calculate level based on total activities and performance
    const level = Math.max(1, Math.floor(activitiesData.length / 10) + 1)
    const totalXP = activitiesData.length * 25 + Math.floor(totalDistance * 10) + Math.floor(totalReps / 10) * 3

    return {
      avgDailySteps,
      avgDailyDistance,
      avgActiveDuration,
      avgDailyReps, // Added to return object
      level,
      totalXP,
    }
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const user = auth.currentUser
      let sessionData = null

      // Check cached session if no active user
      if (!user) {
        const storedSession = await AsyncStorage.getItem("userSession")
        sessionData = safeParseJSON(storedSession, null)
        if (!sessionData?.uid || !sessionData.emailVerified) {
          setError("Please sign in to view activities")
          setLoading(false)
          setQuestLoading(false)
          setRefreshing(false)
          return
        }
      }

      const userId = user ? user.uid : sessionData.uid

      // Determine date range based on selected time period
      let startDate, endDate
      if (timePeriod === "week") {
        const weekDates = getWeekDates()
        startDate = new Date(weekDates[0].date)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(weekDates[6].date)
        endDate.setHours(23, 59, 59, 999)
      } else {
        const year = currentMonthDate.getFullYear()
        const month = currentMonthDate.getMonth()
        startDate = new Date(year, month, 1)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(year, month + 1, 0)
        endDate.setHours(23, 59, 59, 999)
      }

      const activitiesRef = collection(db, "activities")
      const activitiesQuery = query(
        activitiesRef,
        where("userId", "==", userId),
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
      )
      const activitiesSnapshot = await getDocs(activitiesQuery)
      const activitiesData = activitiesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))

      if (activitiesData.length > 0) {
        // Sort to find the latest activity in the queried period
        const sorted = [...activitiesData].sort(
          (a, b) => (toJsDate(b.createdAt) || new Date()) - (toJsDate(a.createdAt) || new Date()),
        )
        const latestActivity = sorted[0] // newest activity

        const toSeconds = (duration) => {
          if (typeof duration === "number") return isFinite(duration) ? duration : 0
          if (typeof duration === "string") {
            const parts = duration.split(":").map((p) => Number.parseInt(p, 10) || 0)
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
            if (parts.length === 2) return parts[0] * 60 + parts[1]
          }
          return 0
        }

        // Compute TODAY totals
        const now = new Date()
        const todayStart = startOfDay(now)
        const todayEnd = endOfDay(now)

        const todaysActivities = activitiesData.filter((a) => {
          const d = toJsDate(a.createdAt)
          return d && d >= todayStart && d <= todayEnd
        })

        const todayTotals = todaysActivities.reduce(
          (acc, a) => {
            acc.distanceKm += toKm(a.distance || 0) // convert meters -> km
            acc.durationSec += toSeconds(a.duration || 0)
            return acc
          },
          { distanceKm: 0, durationSec: 0 },
        )

        // Format primary cards strictly for today
        const formattedTodayDistance = formatKm(todayTotals.distanceKm)
        const formattedTodayDuration = formatTime
          ? formatTime(todayTotals.durationSec)
          : `${Math.floor(todayTotals.durationSec / 60)
            .toString()
            .padStart(2, "0")}:${Math.floor(todayTotals.durationSec % 60)
              .toString()
              .padStart(2, "0")}`

        // Preserve latest activity stats for the "Recent Activity" section
        const formattedPace = latestActivity?.pace
          ? (typeof latestActivity.pace === "number" ? formatTime(latestActivity.pace) : latestActivity.pace) + "/km"
          : "0:00/km"

        setActivityData({
          coordinates: Array.isArray(latestActivity?.coordinates) ? latestActivity.coordinates : [],
          activityType: latestActivity?.activityType || "walking",
          steps: Number(latestActivity?.steps) || 0,
          stats: {
            pace: formattedPace,
            avgSpeed: latestActivity?.avgSpeed
              ? `${Number.parseFloat(latestActivity.avgSpeed).toFixed(1)} km/h`
              : "0 km/h",
          },
          distance: formattedTodayDistance,
          duration: formattedTodayDuration,
        })
      } else {
        // No data: cards show zero
        setActivityData({
          coordinates: [],
          distance: "0 km",
          duration: "0:00",
          steps: 0,
          activityType: "walking",
          stats: { pace: "0:00/km", avgSpeed: "0 km/h" },
        })
      }

      // Calculate user statistics and generate dynamic quests
      const calculatedStats = calculateUserStats(activitiesData)

      setPeriodStats({
        avgDailySteps: calculatedStats.avgDailySteps,
        avgDailyDistance: calculatedStats.avgDailyDistance,
        avgActiveDuration: calculatedStats.avgActiveDuration,
        avgDailyReps: calculatedStats.avgDailyReps,
      })

      // Generate quests based on period averages but keep overall userStats intact
      const generatedQuests = generateDynamicQuests(userStats, userStats.level)
      setDynamicQuests(generatedQuests)

      // Load quest history
      const userQuestHistory = await getUserQuestHistory(userId)
      setQuestHistory(userQuestHistory)

      // Process weekly and monthly progress
      const todayQuest = generatedQuests[0]
      if (todayQuest) {
        const weekProgress = weekDates.map(({ date }) => {
          const startOfDay = new Date(date)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(date)
          endOfDay.setHours(23, 59, 59, 999)

          const dayActivities = activitiesData.filter((act) => {
            const actDate = act.createdAt?.toDate()
            return actDate && actDate >= startOfDay && actDate <= endOfDay
          })

          let totalValue = 0
          if (todayQuest.unit === "steps") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.steps) || 0), 0)
          } else if (todayQuest.unit === "distance") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.distance) || 0) / 1000, 0) // ✅ convert meters→km
          } else if (todayQuest.unit === "duration") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.duration) || 0), 0)
          } else if (todayQuest.unit === "reps") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.reps) || 0), 0)
          }

          const progress = todayQuest.goal ? Math.min(totalValue / todayQuest.goal, 1) : 0
          return { date, progress, completed: progress >= 1, activities: dayActivities }
        })
        setWeeklyProgress(weekProgress)

        const monthProgress = monthCalendar.map(({ date, isCurrentMonth }) => {
          if (!date || !isCurrentMonth) return { date, progress: 0, completed: false, activities: [] }

          const startOfDay = new Date(date)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(date)
          endOfDay.setHours(23, 59, 59, 999)

          const dayActivities = activitiesData.filter((act) => {
            const actDate = act.createdAt?.toDate()
            return actDate && actDate >= startOfDay && actDate <= endOfDay
          })

          let totalValue = 0
          if (todayQuest.unit === "steps") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.steps) || 0), 0)
          } else if (todayQuest.unit === "distance") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.distance) || 0) / 1000, 0) // ✅ convert meters→km
          } else if (todayQuest.unit === "duration") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.duration) || 0), 0)
          } else if (todayQuest.unit === "reps") {
            totalValue = dayActivities.reduce((sum, act) => sum + (Number(act.reps) || 0), 0)
          }

          const progress = todayQuest.goal ? Math.min(totalValue / todayQuest.goal, 1) : 0
          return { date, progress, completed: progress >= 1, activities: dayActivities }
        })
        setMonthlyProgress(monthProgress)
      }

      setLoading(false)
      setQuestLoading(false)
      setRefreshing(false)
    } catch (err) {
      console.error("Error fetching data:", err.message)
      setError("Failed to load dashboard data. Please try again.")
      setLoading(false)
      setQuestLoading(false)
      setRefreshing(false)
    }
  }, [timePeriod, weekDates, monthCalendar, currentMonthDate])



  useEffect(() => {
    const init = async () => {
      const { isValidSession } = await initializeUserData()
      if (isValidSession) {
        fetchData()
      } else {
        setError("Please sign in to view activities")
        setLoading(false)
      }
    }
    init()
  }, [initializeUserData, fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])


  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [fetchData])

  const calculateQuestProgress = (quest) => {
    if (!quest || !activityData) return 0;

    let currentValue = 0;

    // 🕒 Handle time-based challenges
    if (quest.mode === "time" && quest.startDate && quest.endDate) {
      const now = Date.now();
      const start = quest.startDate.seconds * 1000; // Firestore timestamp
      const end = new Date(quest.endDate).getTime();
      const totalDuration = end - start;
      const elapsed = Math.max(0, now - start);

      return Math.min(elapsed / totalDuration, 1); // progress as fraction
    }

    // 👣 Steps
    if (quest.unit === "steps") {
      currentValue = Number(activityData.steps) || 0;
    }
    // 📏 Distance (stored as meters → km)
    else if (quest.unit === "distance") {
      const meters = unifyUnits(activityData.distance, "meters");
      currentValue = meters / 1000;
    }
    // ⏱️ Duration (convert to minutes)
    else if (quest.unit === "duration") {
      if (typeof activityData.duration === "string") {
        const durationParts = activityData.duration.split(":").map(Number);
        if (durationParts.length === 3) {
          const [h, m, s] = durationParts;
          currentValue = h * 60 + m + s / 60;
        } else {
          const [m, s] = durationParts;
          currentValue = m + s / 60;
        }
      } else {
        currentValue = (Number(activityData.duration) || 0) / 60;
      }
    }
    // 💪 Reps
    else if (quest.unit === "reps") {
      const totalReps = Array.isArray(activityData)
        ? activityData
          .filter((a) => typeof a.reps === "number" && a.reps > 0)
          .reduce((sum, a) => sum + a.reps, 0)
        : Number(activityData.reps) || 0;

      return QuestProgressManager.getSessionValue(quest, { reps: totalReps });
    }

    return quest.goal ? Math.min(currentValue / quest.goal, 1) : 0;
  };

  const getQuestStatus = (quest) => {
    const progress = calculateQuestProgress(quest)
    if (progress >= 1) return "completed"
    if (progress > 0) return "in_progress"
    return "not_started"
  }

  const getCurrentQuestValue = (quest) => {
    if (!quest || !activityData) return 0

    const stats = {
      steps: Number(activityData.steps) || 0,
      reps: Number(activityData.reps) || 0,
      distance: Number(activityData.distanceRaw || 0),
      duration: Number(activityData.durationSeconds || 0),
    }

    const calories = Number(activityData.calories) || 0

    return QuestProgressManager.getSessionValue(quest, stats, calories)
  }

  // Enhanced Navigate to activity screen with quest details
  const navigateToQuestActivity = async (quest) => {
    try {
      setIsQuestModalVisible(false)

      navigateToActivity({
        questId: quest.id,
        title: quest.title,
        description: quest.description,
        goal: quest.goal,
        unit: quest.unit,
        progress: calculateQuestProgress(quest),
        status: getQuestStatus(quest),
        activityType: quest.activityType,
        xpReward: quest.xpReward,
        difficulty: quest.difficulty,
        category: quest.category,
      })
    } catch (error) {
      console.error("Error starting quest:", error)
    }
  }

  // Simplified function to view activity details in modal
  const viewActivityDetails = (activity) => {
    setSelectedActivity(activity)
    setIsActivityModalVisible(true)
  }

  // Function to resume activity from modal
  const resumeActivity = () => {
    setIsActivityModalVisible(false)
    if (selectedActivity) {
      navigateToActivity({
        activityType: selectedActivity.activityType,
        coordinates: Array.isArray(selectedActivity.coordinates) ? selectedActivity.coordinates : [],
        stats: {
          distance: Number.parseFloat(selectedActivity.distance) * 1000 || 0, // Convert km to meters
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
          steps: Number(selectedActivity.steps) || 0,
        },
      })
    }
  }

  // Function to clear activity from modal
  const clearActivity = () => {
    setIsActivityModalVisible(false)
    // Additional logic for clearing activity can be added here if needed
  }

  // Toggle time period dropdown
  const toggleTimeDropdown = () => {
    setIsTimeDropdownVisible(!isTimeDropdownVisible)
  }

  // Select time period and close dropdown
  const selectTimePeriod = (period) => {
    setTimePeriod(period)
    setIsTimeDropdownVisible(false)
  }

  // Function to render a day cell in the month calendar
  const renderCalendarDay = (dayInfo, index) => {
    if (!dayInfo.isCurrentMonth) {
      return (
        <View key={index} style={twrnc`w-[14.28%] aspect-square items-center justify-center opacity-30`}>
          {dayInfo.day && <CustomText style={twrnc`text-gray-500 text-xs`}>{dayInfo.day}</CustomText>}
        </View>
      )
    }
    // Find progress data for this day
    const progressData = monthlyProgress.find(
      (p) => p.date && p.date.toDateString() === dayInfo.date.toDateString(),
    ) || { progress: 0, completed: false, activities: [] }
    const isCompleted = progressData.completed
    const progress = progressData.progress
    const isToday = dayInfo.isToday
    const hasActivities = Array.isArray(progressData.activities) && progressData.activities.length > 0

    // Determine background color based on progress
    let bgColor = "bg-[#2A2E3A]" // No activity
    if (progress > 0 && progress < 1) {
      bgColor = "bg-[#4361EE]" // Partial progress
    } else if (hasActivities && !isCompleted) {
      bgColor = "bg-[#FFC107]" // Activity done, but goal not completed
    } else if (isCompleted) {
      bgColor = "bg-[#06D6A0]" // Goal achieved
    }

    // Accessibility label for screen readers
    const accessibilityLabel = `Day ${dayInfo.day}, ${isToday ? "Today, " : ""}${Math.round(progress * 100)}% progress, ${isCompleted ? "goal completed" : hasActivities ? "activity recorded" : "no activity"
      }.`
    const accessibilityHint = `Double tap to view activities for ${formatDate(dayInfo.date)}.`

    return (
      <TouchableOpacity
        key={index}
        style={[
          twrnc`w-[14.28%] aspect-square items-center justify-center p-1`,
          // Ensure touch target is at least 48x48 for accessibility
          { minWidth: 48, minHeight: 48 },
        ]}
        activeOpacity={0.7} // Enhanced interactivity
        onPress={() => dayInfo.date && handleDaySelection(dayInfo.date)}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View
          style={twrnc`w-full h-full rounded-2xl items-center justify-center
          ${bgColor}
          ${isToday ? "border-2 border-[#4361EE]" : ""}`}
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : hasActivities ? (
            <View style={twrnc`items-center`}>
              <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-xs`}>
                {dayInfo.day}
              </CustomText>
              {/* Show progress percentage for partial progress, or a dot for just activity */}
              {progress > 0 && progress < 1 ? (
                <CustomText style={twrnc`text-white text-[10px]`}>{Math.round(progress * 100)}%</CustomText>
              ) : (
                <View style={twrnc`w-1 h-1 bg-white rounded-full mt-1`} />
              )}
            </View>
          ) : progress > 0 ? (
            <View style={twrnc`items-center`}>
              <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-xs`}>
                {dayInfo.day}
              </CustomText>
              <CustomText style={twrnc`text-white text-[10px]`}>{Math.round(progress * 100)}%</CustomText>
            </View>
          ) : (
            <CustomText weight={isToday ? "bold" : "medium"} style={twrnc`text-white text-sm`}>
              {dayInfo.day}
            </CustomText>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  // Function to handle day selection from the calendar
  const handleDaySelection = async (date) => {
    try {
      setSelectedCalendarDate(date) // Update selected date for highlighting
      setLoading(true)
      const user = auth.currentUser
      if (!user) {
        setError("Please sign in to view activities")
        setLoading(false)
        return
      }

      // Verify session from AsyncStorage
      const storedSession = await AsyncStorage.getItem("userSession")
      const sessionData = safeParseJSON(storedSession, null)
      if (!sessionData?.uid || !sessionData.emailVerified || sessionData.uid !== user.uid) {
        setError("Invalid or expired session. Please sign in again.")
        setLoading(false)
        return
      }

      // Set start and end of the selected day
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      // Query activities for the selected day
      const activitiesRef = collection(db, "activities")
      const activitiesQuery = query(
        activitiesRef,
        where("userId", "==", user.uid),
        where("createdAt", ">=", startOfDay),
        where("createdAt", "<=", endOfDay),
      )
      const activitiesSnapshot = await getDocs(activitiesQuery)
      const activitiesData = activitiesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // Enhanced formatting for all activity types
        displayInfo: getActivityDisplayInfo(doc.data()),
        formattedTime: doc.data().createdAt?.toDate
          ? doc.data().createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "",
      }))

      if (activitiesData.length > 0) {
        // Sort activities by time (newest first)
        activitiesData.sort((a, b) => (b.createdAt?.toDate() || new Date()) - (a.createdAt?.toDate() || new Date()))
        setDateActivities(activitiesData)
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

  // Function to navigate month in calendar
  const navigateMonth = useCallback((direction) => {
    setCurrentMonthDate((prevDate) => {
      const newDate = new Date(prevDate)
      newDate.setMonth(prevDate.getMonth() + direction)
      return newDate
    })
  }, [])

  if (loading || questLoading) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center`}>
        <ActivityIndicator size="large" color="#4361EE" />
        <CustomText style={twrnc`text-white mt-4`}>Loading Dashboard...</CustomText>
      </View>
    )
  }

  if (error) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center px-6`}>
        <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-6 items-center w-full max-w-sm`}>
          <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-full p-4 mb-4`}>
            <Ionicons name="alert-circle" size={32} color="#EF476F" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-lg mb-2 text-center`}>
            Something went wrong
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm text-center mb-6`}>{error}</CustomText>
          <TouchableOpacity style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl w-full`} onPress={fetchData}>
            <CustomText weight="bold" style={twrnc`text-white text-center`}>
              Try Again
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Get today's main quest
  const todayQuest = dynamicQuests[0]

  return (
    <View style={twrnc`flex-1 bg-[#121826]`}>
      <ScrollView
        style={twrnc`flex-1`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4361EE"
            colors={["#4361EE", "#FFC107"]}
          />
        }
      >
        <View style={twrnc`px-${responsivePadding.base} mb-6`}>
          {/* Header Section - Made responsive */}
          <View style={twrnc`flex-row justify-between items-center mb-6`}>
            <View style={twrnc`flex-1 mr-2`}>
              <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes["2xl"] }]}>
                Your Progress
              </CustomText>
              <View style={twrnc`flex-row items-center mt-1 flex-wrap`}>
                <View style={twrnc`bg-[#4361EE] rounded-full px-3 py-1 mr-2 mb-1`}>
                  <CustomText style={[twrnc`text-white`, { fontSize: responsiveFontSizes.xs }]}>
                    Level {userStats.level}
                  </CustomText>
                </View>
                <View style={twrnc`bg-[#FFC107] rounded-full px-3 py-1 mb-1`}>
                  <CustomText style={[twrnc`text-[#121826]`, { fontSize: responsiveFontSizes.xs }]}>
                    {userStats.totalXP} XP
                  </CustomText>
                </View>
              </View>
            </View>
            {/* Time Period Dropdown */}
            <View style={twrnc`relative`}>
              <TouchableOpacity
                style={twrnc`flex-row items-center bg-[#2A2E3A] rounded-2xl px-3 py-2`}
                onPress={toggleTimeDropdown}
              >
                <CustomText style={[twrnc`text-white`, { fontSize: responsiveFontSizes.sm }]}>
                  {timePeriod === "week" ? "Week" : "Month"}
                </CustomText>
                <Ionicons name={isTimeDropdownVisible ? "chevron-up" : "chevron-down"} size={16} color="#FFFFFF" />
              </TouchableOpacity>
              {/* Dropdown Menu */}
              {isTimeDropdownVisible && (
                <View
                  style={twrnc`absolute top-12 right-0 bg-[#2A2E3A] rounded-2xl shadow-lg z-10 w-32 overflow-hidden`}
                >
                  <TouchableOpacity
                    style={twrnc`px-4 py-3 ${timePeriod === "week" ? "bg-[#4361EE]" : ""}`}
                    onPress={() => selectTimePeriod("week")}
                  >
                    <CustomText style={twrnc`text-white text-sm`}>Week</CustomText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twrnc`px-4 py-3 ${timePeriod === "month" ? "bg-[#4361EE]" : ""}`}
                    onPress={() => selectTimePeriod("month")}
                  >
                    <CustomText style={twrnc`text-white text-sm`}>Month</CustomText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Progress Calendar - Week View - Made responsive and consistent with month view */}
          {timePeriod === "week" && (
            <View style={twrnc`flex-row justify-between mb-6`}>
              {weekDates.map((day, index) => {
                const progressData = weeklyProgress[index] || { progress: 0, completed: false, activities: [] }
                const isCompleted = progressData.completed
                const progress = progressData.progress
                const hasActivities = Array.isArray(progressData.activities) && progressData.activities.length > 0
                return (
                  <TouchableOpacity
                    key={index}
                    style={twrnc`items-center justify-center rounded-2xl w-12 h-12
                    ${isCompleted ? "bg-[#06D6A0]" : hasActivities ? "bg-[#FFC107]" : progress > 0 ? "bg-[#4361EE]" : "bg-[#2A2E3A]"}
                    ${day.isToday ? "border-2 border-[#4361EE]" : ""}`}
                    activeOpacity={0.7}
                    onPress={() => day.date && handleDaySelection(day.date)}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    ) : hasActivities ? (
                      <View style={twrnc`items-center`}>
                        <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-xs`}>
                          {day.day}
                        </CustomText>
                        <View style={twrnc`w-1 h-1 bg-white rounded-full mt-1`} />
                      </View>
                    ) : progress > 0 ? (
                      <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-xs`}>
                        {Math.round(progress * 100)}%
                      </CustomText>
                    ) : (
                      <CustomText weight={day.isToday ? "bold" : "medium"} style={twrnc`text-white text-sm`}>
                        {day.day}
                      </CustomText>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {/* Month Calendar View - Made responsive */}
          {timePeriod === "month" && (
            <View style={twrnc`mb-6`}>
              {/* Month and Year Header with Navigation */}
              <View style={twrnc`flex-row justify-between items-center mb-4`}>
                <TouchableOpacity onPress={() => navigateMonth(-1)} style={twrnc`p-2`}>
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.lg }]}>
                  {getMonthYearString(currentMonthDate)}
                </CustomText>
                <TouchableOpacity onPress={() => navigateMonth(1)} style={twrnc`p-2`}>
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              {/* Weekday Headers */}
              <View style={twrnc`flex-row justify-between mb-3`}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                  <View key={index} style={twrnc`w-[14.28%] items-center`}>
                    <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.sm }]}>{day}</CustomText>
                  </View>
                ))}
              </View>
              {/* Calendar Grid */}
              <View style={twrnc`flex-row flex-wrap mb-4`}>
                {monthCalendar.map((day, index) => renderCalendarDay(day, index))}
              </View>
              {/* Enhanced Legend */}
              <View style={twrnc`flex-row justify-center flex-wrap`}>
                <View style={twrnc`flex-row items-center mx-2 my-1`}>
                  <View style={twrnc`w-3 h-3 rounded-full bg-[#2A2E3A] mr-2`} />
                  <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                    No Activity
                  </CustomText>
                </View>
                <View style={twrnc`flex-row items-center mx-2 my-1`}>
                  <View style={twrnc`w-3 h-3 rounded-full bg-[#FFC107] mr-2`} />
                  <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                    Activity Done
                  </CustomText>
                </View>
                <View style={twrnc`flex-row items-center mx-2 my-1`}>
                  <View style={twrnc`w-3 h-3 rounded-full bg-[#06D6A0] mr-2`} />
                  <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                    Quest Achieved
                  </CustomText>
                </View>
              </View>
            </View>
          )}

          {/* Stats Cards - Made responsive */}
          <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-6`}>
            <View style={twrnc`flex-row justify-between`}>
              <View style={twrnc`items-center flex-1`}>
                <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-2xl p-3 mb-2`}>
                  <Ionicons name="location" size={width * 0.06} color="#06D6A0" />
                </View>
                <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.lg }]}>
                  {activityData.distance}
                </CustomText>
                <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                  Distance Today
                </CustomText>
              </View>
              <View style={twrnc`items-center flex-1`}>
                <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-2xl p-3 mb-2`}>
                  <Ionicons name="time" size={width * 0.06} color="#FFC107" />
                </View>
                <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.lg }]}>
                  {activityData.duration}
                </CustomText>
                <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                  Active Time
                </CustomText>
              </View>
            </View>
          </View>

          {/* Dynamic Quest Card - Made responsive */}
          {todayQuest && (
            <View style={twrnc`mx-0 bg-[#2A2E3A] rounded-2xl p-5 mb-6`}>
              <View style={twrnc`flex-row items-center mb-4`}>
                <View style={twrnc`bg-[#4361EE] rounded-2xl p-3 mr-4`}>
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
                    size={width * 0.06}
                    color="#FFFFFF"
                  />
                </View>
                <View style={twrnc`flex-1`}>
                  <View style={twrnc`flex-row items-center justify-between mb-1 flex-wrap`}>
                    <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.lg }]}>
                      {todayQuest.title}
                    </CustomText>
                    <View style={twrnc`bg-[#FFC107] rounded-full px-3 py-1`}>
                      <CustomText style={[twrnc`text-[#121826]`, { fontSize: responsiveFontSizes.xs }]}>
                        +{todayQuest.xpReward} XP
                      </CustomText>
                    </View>
                  </View>
                  <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.sm }]}>
                    {todayQuest.description}
                  </CustomText>
                  <View style={twrnc`flex-row items-center flex-wrap mt-2`}>
                    <View style={twrnc`bg-[#3A3F4B] rounded-full px-3 py-1 mr-2 mb-1`}>
                      <CustomText style={[twrnc`text-white`, { fontSize: responsiveFontSizes.xs }]}>
                        {todayQuest.difficulty.charAt(0).toUpperCase() + todayQuest.difficulty.slice(1)}
                      </CustomText>
                    </View>
                    <CustomText style={[twrnc`text-[#4361EE]`, { fontSize: responsiveFontSizes.xs }]}>
                      {todayQuest.category.charAt(0).toUpperCase() + todayQuest.category.slice(1)}
                    </CustomText>
                  </View>
                </View>
              </View>
              {/* Progress Bar */}
              <View style={twrnc`mb-4`}>
                <View style={twrnc`flex-row justify-between items-center mb-2`}>
                  <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.sm }]}>Progress</CustomText>
                  <CustomText style={[twrnc`text-[#FFC107]`, { fontSize: responsiveFontSizes.sm }]}>
                    {Math.round(calculateQuestProgress(todayQuest) * 100)}% •{" "}
                    {getCurrentQuestValue(todayQuest).toFixed(2)}/{todayQuest.goal.toFixed(2)} {todayQuest.unit}
                  </CustomText>
                </View>
                <View style={twrnc`h-3 bg-[#3A3F4B] rounded-full overflow-hidden`}>
                  <View
                    style={[
                      twrnc`h-3 rounded-full`,
                      {
                        width: `${calculateQuestProgress(todayQuest) * 100}%`,
                        backgroundColor: getQuestStatus(todayQuest) === "completed" ? "#06D6A0" : "#FFC107",
                      },
                    ]}
                  />
                </View>
              </View>
              {/* Action Buttons */}
              <View style={twrnc`flex-row`}>
                <TouchableOpacity
                  style={[
                    twrnc`flex-1 rounded-2xl py-3 items-center mr-3`,
                    getQuestStatus(todayQuest) === "completed" ? twrnc`bg-[#06D6A0]` : twrnc`bg-[#4361EE]`,
                  ]}
                  onPress={() => navigateToQuestActivity(todayQuest)}
                >
                  <CustomText weight="bold" style={twrnc`text-white`}>
                    {getQuestStatus(todayQuest) === "completed" ? "Completed ✓" : "Start Quest"}
                  </CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twrnc`bg-[#3A3F4B] rounded-2xl py-3 px-4 items-center`}
                  onPress={() => setIsQuestModalVisible(true)}
                >
                  <Ionicons name="list" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Last Activity Section - Made responsive */}
          <View style={twrnc`px-0 mb-20`}>
            <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.xl }]}>
              Recent Activity
            </CustomText>
            {activityData.coordinates.length > 0 || activityData.activityType !== "walking" ? (
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] rounded-2xl overflow-hidden mb-4 shadow-md`}
                onPress={() => viewActivityDetails(activityData)}
              >
                {/* Map Section - Responsive height */}
                {activityData.coordinates.length > 0 && (
                  <View style={{ height: height * 0.2 }}>
                    <MapView
                      style={twrnc`w-full h-full`}
                      initialRegion={calculateMapRegion(activityData.coordinates)}
                      customMapStyle={[
                        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
                        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
                        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
                        { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFC107" }] },
                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
                      ]}
                      provider={PROVIDER_GOOGLE}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                    >
                      <Polyline coordinates={activityData.coordinates} strokeColor="#4361EE" strokeWidth={4} />
                    </MapView>
                  </View>
                )}
                {/* Activity Details - Responsive */}
                <View style={twrnc`p-4`}>
                  <View style={twrnc`flex-row justify-between items-center mb-2`}>
                    <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.base }]}>
                      {activityData.activityType.charAt(0).toUpperCase() + activityData.activityType.slice(1)} Workout
                    </CustomText>
                    <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                      {formatDate()}
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row justify-between items-center`}>
                    <View style={twrnc`items-center flex-1`}>
                      <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                        Distance
                      </CustomText>
                      <CustomText weight="bold" style={[twrnc`text-[#06D6A0]`, { fontSize: responsiveFontSizes.base }]}>
                        {activityData.distance}
                      </CustomText>
                    </View>
                    <View style={twrnc`items-center flex-1`}>
                      <CustomText weight="bold" style={[twrnc`text-[#FFC107]`, { fontSize: responsiveFontSizes.base }]}>
                        {activityData.duration}
                      </CustomText>
                    </View>
                    <View style={twrnc`items-center flex-1`}>
                      <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>Pace</CustomText>
                      <CustomText weight="bold" style={[twrnc`text-[#4361EE]`, { fontSize: responsiveFontSizes.base }]}>
                        {activityData.stats.pace}
                      </CustomText>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              // No Activity State - Responsive
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-6 items-center`}>
                <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-2xl p-4 mb-4`}>
                  <Ionicons name="fitness" size={width * 0.08} color="#4361EE" />
                </View>
                <CustomText weight="bold" style={[twrnc`text-white`, { fontSize: responsiveFontSizes.xl }]}>
                  Ready to Start?
                </CustomText>
                <CustomText
                  style={[twrnc`text-gray-400 text-center mb-6 leading-5`, { fontSize: responsiveFontSizes.sm }]}
                >
                  No activities yet. Start tracking your first workout to see your progress here!
                </CustomText>
                <View style={twrnc`flex-row flex-wrap justify-center gap-3 w-full`}>
                  <TouchableOpacity
                    style={twrnc`bg-[#4361EE] px-6 py-3 rounded-2xl flex-1 min-w-32 items-center`}
                    onPress={() => navigateToActivity()}
                  >
                    <Ionicons name="play" size={16} color="#FFFFFF" style={twrnc`mb-1`} />
                    <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                      Start Activity
                    </CustomText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twrnc`bg-[#2A2E3A] border border-[#4361EE] px-6 py-3 rounded-2xl flex-1 min-w-32 items-center`}
                    onPress={() => navigateToActivity({ activityType: "walking" })}
                  >
                    <Ionicons name="walk" size={16} color="#4361EE" style={twrnc`mb-1`} />
                    <CustomText weight="bold" style={twrnc`text-[#4361EE] text-sm`}>
                      Quick Walk
                    </CustomText>
                  </TouchableOpacity>
                </View>
                {/* Motivational Stats - Responsive */}
                <View style={twrnc`flex-row justify-between w-full mt-6 pt-4 border-t border-[#3A3F4B]`}>
                  <View style={twrnc`items-center flex-1`}>
                    <CustomText style={[twrnc`text-[#FFC107]`, { fontSize: responsiveFontSizes.lg }]}>0</CustomText>
                    <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                      Activities
                    </CustomText>
                  </View>
                  <View style={twrnc`items-center flex-1`}>
                    <CustomText style={[twrnc`text-[#4361EE]`, { fontSize: responsiveFontSizes.lg }]}>
                      Level {userStats.level}
                    </CustomText>
                    <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                      Current Level
                    </CustomText>
                  </View>
                  <View style={twrnc`items-center flex-1`}>
                    <CustomText style={[twrnc`text-[#06D6A0]`, { fontSize: responsiveFontSizes.lg }]}>
                      {userStats.totalXP}
                    </CustomText>
                    <CustomText style={[twrnc`text-gray-400`, { fontSize: responsiveFontSizes.xs }]}>
                      Total XP
                    </CustomText>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Dynamic Quest List Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isQuestModalVisible}
        onRequestClose={() => setIsQuestModalVisible(false)}
      >
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-gray-900 rounded-t-3xl p-6 h-4/5`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-start mb-6`}>
              <View style={twrnc`flex-1 pr-4`}>
                <CustomText weight="bold" style={twrnc`text-white text-2xl mb-1`}>
                  Daily Quests
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-sm`}>
                  Personalized challenges based on your performance
                </CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-gray-800 p-2 rounded-xl`} onPress={() => setIsQuestModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Quest List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={twrnc`pb-4`}>
              {dynamicQuests.length > 0 ? (
                dynamicQuests.map((quest, index) => {
                  const progress = calculateQuestProgress(quest)
                  const status = getQuestStatus(quest)
                  const isCompleted = status === "completed"

                  return (
                    <View
                      key={quest.id || index}
                      style={twrnc`bg-gray-800 rounded-2xl p-5 mb-4 shadow-lg border border-gray-700/50`}
                    >
                      {/* Quest Header */}
                      <View style={twrnc`flex-row items-start mb-4`}>
                        <View
                          style={[
                            twrnc`rounded-xl p-3 mr-4`,
                            isCompleted ? twrnc`bg-emerald-500` : twrnc`bg-[#4361EE]`,
                          ]}
                        >
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
                            size={22}
                            color="#FFFFFF"
                          />
                        </View>

                        <View style={twrnc`flex-1`}>
                          <View style={twrnc`flex-row items-center justify-between mb-1`}>
                            <CustomText
                              weight="bold"
                              style={twrnc`text-white text-lg flex-shrink mr-2`}
                              numberOfLines={1}
                            >
                              {quest.title}
                            </CustomText>
                            <View style={twrnc`bg-amber-400 rounded-full px-2.5 py-1`}>
                              <CustomText style={twrnc`text-gray-900 text-xs font-bold`}>
                                +{quest.xpReward} XP
                              </CustomText>
                            </View>
                          </View>

                          <CustomText style={twrnc`text-gray-400 text-sm mb-2`} numberOfLines={2}>
                            {quest.description}
                          </CustomText>

                          <View style={twrnc`flex-row flex-wrap gap-2`}>
                            <View style={twrnc`bg-gray-700 rounded-full px-3 py-1.5`}>
                              <CustomText style={twrnc`text-white text-xs`}>
                                {quest.difficulty.charAt(0).toUpperCase() + quest.difficulty.slice(1)}
                              </CustomText>
                            </View>
                            <View style={twrnc`bg-blue-500/20 rounded-full px-3 py-1.5`}>
                              <CustomText style={twrnc`text-blue-400 text-xs`}>
                                {quest.category.charAt(0).toUpperCase() + quest.category.slice(1)}
                              </CustomText>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Progress Bar */}
                      <View style={twrnc`mb-4`}>
                        <View style={twrnc`flex-row justify-between items-center mb-2`}>
                          <CustomText style={twrnc`text-gray-400 text-xs`}>Progress</CustomText>
                          <CustomText
                            style={[
                              twrnc`text-xs font-medium`,
                              isCompleted ? twrnc`text-emerald-400` : twrnc`text-amber-400`,
                            ]}
                          >
                            {Math.round(progress * 100)}%
                          </CustomText>
                        </View>
                        <View style={twrnc`h-2 bg-gray-700 rounded-full overflow-hidden`}>
                          <View
                            style={[
                              twrnc`h-2 rounded-full`,
                              {
                                width: `${progress * 100}%`,
                                backgroundColor: isCompleted ? "#10B981" : "#F59E0B",
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {/* Action Button */}
                      <TouchableOpacity
                        style={[
                          twrnc`rounded-xl py-3.5 items-center justify-center flex-row`,
                          isCompleted ? twrnc`bg-emerald-500` : twrnc`bg-[#4361EE]`,
                        ]}
                        onPress={() => !isCompleted && navigateToQuestActivity(quest)}
                        disabled={isCompleted}
                      >
                        {isCompleted && <Ionicons name="checkmark" size={20} color="#FFFFFF" style={twrnc`mr-2`} />}
                        <CustomText weight="bold" style={twrnc`text-white`}>
                          {isCompleted ? "Quest Completed" : "Start Quest"}
                        </CustomText>
                      </TouchableOpacity>
                    </View>
                  )
                })
              ) : (
                <View style={twrnc`items-center justify-center py-16`}>
                  <View style={twrnc`bg-gray-800 p-6 rounded-2xl mb-5`}>
                    <Ionicons name="trophy-outline" size={48} color="#6B7280" />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-gray-300 text-lg mb-2 text-center`}>
                    No Quests Available
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-center`}>
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
          <View style={twrnc`max-h-4/5 bg-gray-900 rounded-t-3xl`}>
            {/* Prevent modal close when touching content */}
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={twrnc`p-6`}>
                {/* Modal Header */}
                <View style={twrnc`flex-row justify-between items-center mb-6`}>
                  <CustomText weight="bold" style={twrnc`text-white text-2xl`}>
                    Activity Details
                  </CustomText>
                  <TouchableOpacity
                    style={twrnc`bg-gray-800 p-2 rounded-xl`}
                    onPress={() => setIsActivityModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Map Section */}
                {selectedActivity?.coordinates?.length > 0 ? (
                  <View style={twrnc`w-full h-64 rounded-2xl overflow-hidden mb-6 border border-gray-700`}>
                    <MapView
                      style={twrnc`w-full h-full`}
                      initialRegion={calculateMapRegion(selectedActivity.coordinates)}
                      customMapStyle={[
                        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
                        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
                        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
                        { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFC107" }] },
                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
                      ]}
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

                    {/* Activity Type Badge */}
                    <View style={twrnc`absolute top-4 left-4 bg-gray-900/80 rounded-full px-3 py-1.5`}>
                      <CustomText style={twrnc`text-white text-sm font-medium`}>
                        {selectedActivity.activityType?.charAt(0).toUpperCase() +
                          selectedActivity.activityType?.slice(1) || "Activity"}
                      </CustomText>
                    </View>
                  </View>
                ) : (
                  <View
                    style={twrnc`w-full h-40 bg-gray-800 justify-center items-center rounded-2xl mb-6 border border-dashed border-gray-600`}
                  >
                    <Ionicons name="map-outline" size={36} color="#6B7280" style={twrnc`mb-2`} />
                    <CustomText style={twrnc`text-gray-400 text-sm text-center`}>No route data available</CustomText>
                  </View>
                )}

                {/* Activity Stats - Using unified display mapper */}
                {selectedActivity &&
                  (() => {
                    const displayInfo = getActivityDisplayInfo(selectedActivity)
                    return (
                      <View style={twrnc`bg-gray-800 rounded-2xl p-5 mb-6`}>
                        <CustomText weight="bold" style={twrnc`text-white text-lg mb-4`}>
                          Activity Summary
                        </CustomText>

                        {/* Top Row Stats */}
                        <View style={twrnc`flex-row justify-between mb-5`}>
                          <View style={twrnc`items-center flex-1`}>
                            <Ionicons
                              name={displayInfo.primaryMetric.icon}
                              size={16}
                              color="#9CA3AF"
                              style={twrnc`mb-1`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-xs mb-1`}>
                              {displayInfo.primaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-xl`, { color: displayInfo.primaryMetric.color }]}
                            >
                              {displayInfo.primaryMetric.value}
                            </CustomText>
                          </View>

                          <View style={twrnc`items-center flex-1 border-l border-r border-gray-700`}>
                            <Ionicons
                              name={displayInfo.secondaryMetric.icon}
                              size={16}
                              color="#9CA3AF"
                              style={twrnc`mb-1`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-xs mb-1`}>
                              {displayInfo.secondaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-xl`, { color: displayInfo.secondaryMetric.color }]}
                            >
                              {displayInfo.secondaryMetric.value}
                            </CustomText>
                          </View>

                          <View style={twrnc`items-center flex-1`}>
                            <Ionicons
                              name={displayInfo.tertiaryMetric.icon}
                              size={16}
                              color="#9CA3AF"
                              style={twrnc`mb-1`}
                            />
                            <CustomText style={twrnc`text-gray-400 text-xs mb-1`}>
                              {displayInfo.tertiaryMetric.label}
                            </CustomText>
                            <CustomText
                              weight="bold"
                              style={[twrnc`text-xl`, { color: displayInfo.tertiaryMetric.color }]}
                            >
                              {displayInfo.tertiaryMetric.value}
                            </CustomText>
                          </View>
                        </View>

                        {/* Bottom Row Info */}
                        <View style={twrnc`flex-row justify-between`}>
                          <View style={twrnc`flex-1 mr-4`}>
                            <CustomText style={twrnc`text-gray-400 text-xs mb-1`}>Activity Type</CustomText>
                            <View style={twrnc`flex-row items-center`}>
                              <Ionicons name={displayInfo.icon} size={16} color="#FFFFFF" style={twrnc`mr-2`} />
                              <CustomText style={twrnc`text-white`}>
                                {selectedActivity.activityType?.charAt(0).toUpperCase() +
                                  selectedActivity.activityType?.slice(1) || "Unknown"}
                              </CustomText>
                            </View>
                          </View>

                          <View style={twrnc`flex-1`}>
                            <CustomText style={twrnc`text-gray-400 text-xs mb-1`}>Date</CustomText>
                            <View style={twrnc`flex-row items-center`}>
                              <Ionicons name="calendar-outline" size={16} color="#FFFFFF" style={twrnc`mr-2`} />
                              <CustomText style={twrnc`text-white`}>
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

                {/* Action Buttons */}
                <View style={twrnc`flex-row gap-3`}>
                  <TouchableOpacity
                    style={twrnc`bg-blue-500 rounded-xl py-4 flex-1 flex-row items-center justify-center`}
                    onPress={resumeActivity}
                  >
                    <Ionicons name="play" size={18} color="#FFFFFF" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-white`}>
                      Resume
                    </CustomText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={twrnc`border border-red-500 rounded-xl py-4 flex-1 flex-row items-center justify-center`}
                    onPress={clearActivity}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF476F" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-red-500`}>
                      Clear
                    </CustomText>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Date Activities Modal - Styled like Quest Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDateActivitiesModalVisible}
        onRequestClose={() => setIsDateActivitiesModalVisible(false)}
      >
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-gray-900 rounded-t-3xl p-6 h-4/5`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-start mb-6`}>
              <View style={twrnc`flex-1 pr-4`}>
                <CustomText weight="bold" style={twrnc`text-white text-2xl mb-1`}>
                  Activities for {formatDate(selectedCalendarDate)}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-sm`}>
                  Track your activities and performance for this day
                </CustomText>
              </View>
              <TouchableOpacity
                style={twrnc`bg-gray-800 p-2 rounded-xl`}
                onPress={() => setIsDateActivitiesModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Activity List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={twrnc`pb-4`}>
              {dateActivities.length > 0 ? (
                dateActivities.map((activity, index) => {
                  const displayInfo = activity.displayInfo || getActivityDisplayInfo(activity)

                  return (
                    <View
                      key={index}
                      style={twrnc`bg-gray-800 rounded-2xl p-5 mb-4 shadow-lg border border-gray-700/50`}
                    >
                      {/* Activity Header */}
                      <View style={twrnc`flex-row justify-between items-center mb-4`}>
                        <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                          {activity.activityType.charAt(0).toUpperCase() + activity.activityType.slice(1)}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-sm`}>{activity.formattedTime}</CustomText>
                      </View>

                      {/* Mini Map */}
                      {activity.coordinates && activity.coordinates.length > 0 && (
                        <View style={twrnc`h-32 rounded-xl overflow-hidden mb-4`}>
                          <MapView
                            style={twrnc`w-full h-full`}
                            initialRegion={calculateMapRegion(activity.coordinates)}
                            scrollEnabled={false}
                            zoomEnabled={false}
                            pitchEnabled={false}
                            rotateEnabled={false}
                          >
                            <Polyline coordinates={activity.coordinates} strokeColor="#4361EE" strokeWidth={3} />
                          </MapView>
                        </View>
                      )}

                      {/* Dynamic Metrics */}
                      <View style={twrnc`flex-row justify-between mb-5`}>
                        {[displayInfo.primaryMetric, displayInfo.secondaryMetric, displayInfo.tertiaryMetric].map(
                          (metric, idx) => (
                            <View key={idx} style={twrnc`items-center flex-1`}>
                              <View style={twrnc`flex-row items-center mb-1`}>
                                <Ionicons name={metric.icon} size={14} color={metric.color} style={twrnc`mr-1`} />
                                <CustomText style={twrnc`text-gray-400 text-xs`}>{metric.label}</CustomText>
                              </View>
                              <CustomText weight="bold" style={twrnc`text-white`}>
                                {metric.value}
                              </CustomText>
                            </View>
                          ),
                        )}
                      </View>

                      {/* Action Button */}
                      <TouchableOpacity
                        style={twrnc`bg-[#4361EE] rounded-xl py-3 items-center flex-row justify-center`}
                        onPress={() => {
                          setIsDateActivitiesModalVisible(false)
                          viewActivityDetails(activity)
                        }}
                      >
                        <Ionicons name="eye-outline" size={18} color="#FFFFFF" style={twrnc`mr-2`} />
                        <CustomText weight="bold" style={twrnc`text-white`}>
                          View Details
                        </CustomText>
                      </TouchableOpacity>
                    </View>
                  )
                })
              ) : (
                <View style={twrnc`items-center justify-center py-16`}>
                  <View style={twrnc`bg-gray-800 p-6 rounded-2xl mb-5`}>
                    <Ionicons name="calendar-outline" size={48} color="#6B7280" />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-gray-300 text-lg mb-2 text-center`}>
                    No Activities Found
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-center`}>
                    Add or complete activities to track your progress!
                  </CustomText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Badge Detail Modal - KEPT */}
      <BadgeModal visible={false} badge={null} onClose={() => { }} />
      {/* Badge Notification Modal - KEPT */}
      <BadgeNotification visible={false} badges={[]} onClose={() => { }} />
      {/* All Badges Modal - KEPT */}
      <AllBadgesModal visible={false} badges={[]} onClose={() => { }} onBadgePress={() => { }} />
    </View>
  )
}

// Update styles to be responsive
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 400, // Maximum width for larger devices
    maxHeight: "80%",
  },
  modalContent: {
    backgroundColor: "#121826",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
})

export default DashboardScreen

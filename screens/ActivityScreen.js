// FileName: ActivityScreen.js
"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
  Vibration,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import CustomModal from "../components/CustomModal"
import { doc, getDoc, serverTimestamp, getDocs, collection, query, where } from "firebase/firestore"
import { db, auth } from "../firebaseConfig"
import { Accelerometer } from "expo-sensors"
import FaceProximityPushUpCounter from "../components/FaceProximityPushUpCounter"
import CountdownOverlay from "../components/CountdownOverlay"
import XPManager from "../utils/xpManager"

// Badge System Imports
import {
  getUserQuestHistory,
  calculateBadgeStats,
  evaluateBadges,
  loadBadgesFromFirestore,
  saveBadgesToFirestore,
} from "./BadgeSystem"

// Import icons
import WalkingIcon from "../components/icons/walking.png"
import RunningIcon from "../components/icons/running.png"
import CyclingIcon from "../components/icons/cycling.png"
import JoggingIcon from "../components/icons/jogging.png"
import PushupIcon from "../components/icons/pushup.png"

const { width, height } = Dimensions.get("window")

const activities = [
  {
    id: "walking",
    name: "Walking",
    icon: WalkingIcon,
    met: 3.5,
    color: "#4361EE",
    iconColor: "#FFFFFF",
    isGpsActivity: true,
  },
  {
    id: "running",
    name: "Running",
    icon: RunningIcon,
    met: 8.0,
    color: "#EF476F",
    iconColor: "#FFFFFF",
    isGpsActivity: true,
  },
  {
    id: "cycling",
    name: "Cycling",
    icon: CyclingIcon,
    met: 6.0,
    color: "#06D6A0",
    iconColor: "#121826",
    isGpsActivity: true,
  },
  {
    id: "jogging",
    name: "Jogging",
    icon: JoggingIcon,
    met: 7.0,
    color: "#FFC107",
    iconColor: "#121826",
    isGpsActivity: true,
  },
  {
    id: "pushup",
    name: "Push-ups",
    icon: PushupIcon,
    met: 3.8,
    color: "#9B5DE5",
    iconColor: "#FFFFFF",
    isGpsActivity: false,
  },
]

// REDESIGNED BUTTON SECTION
const ButtonSection = ({
  coordinates,
  isStrengthActivity,
  stats,
  sensorSubscription,
  isTrackingLoading,
  currentActivity,
  activeQuest,
  resumeTracking,
  saveActivity,
  clearActivity,
  startActivity,
}) => {
  return (
    <View style={twrnc`px-5 mb-6`}>
      {coordinates.length > 0 || (isStrengthActivity && stats.reps > 0) || sensorSubscription ? (
        <View style={twrnc`gap-3`}>
          {/* Save Activity Button */}
          {isStrengthActivity && (
            <TouchableOpacity
              style={twrnc`bg-06D6A0 rounded-2xl py-4 px-6 flex-row items-center justify-center ${isTrackingLoading ? "opacity-50" : ""
                }`}
              onPress={saveActivity}
              disabled={isTrackingLoading}
              activeOpacity={0.8}
            >
              {isTrackingLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Save Activity
                </CustomText>
              )}
            </TouchableOpacity>
          )}

          {/* Resume Tracking Button for GPS activities */}
          {!isStrengthActivity && (
            <TouchableOpacity
              style={twrnc`bg-4361EE rounded-2xl py-4 px-6 flex-row items-center justify-center`}
              onPress={resumeTracking}
              disabled={isTrackingLoading}
              activeOpacity={0.8}
            >
              <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                Resume Tracking
              </CustomText>
            </TouchableOpacity>
          )}

          {/* Clear Activity Button */}
          <TouchableOpacity
            style={twrnc`bg-1e293b border border-EF476F rounded-2xl py-4 px-6 flex-row items-center justify-center`}
            onPress={clearActivity}
            disabled={isTrackingLoading}
            activeOpacity={0.8}
          >
            <CustomText weight="bold" style={twrnc`text-EF476F text-sm`}>
              Clear Activity
            </CustomText>
          </TouchableOpacity>
        </View>
      ) : (
        !sensorSubscription && (
          <TouchableOpacity
            style={[
              twrnc`rounded-2xl py-4 px-6 flex-row items-center justify-center shadow-lg`,
              {
                backgroundColor: '#4361EE', // Force blue background
              }
            ]}
            onPress={startActivity}
            disabled={isTrackingLoading}
            activeOpacity={0.8}
          >
            <CustomText weight="bold" style={[twrnc`text-sm`, { color: '#FFFFFF' }]}>
              {activeQuest
                ? activeQuest.category === "challenge"
                  ? "Start Challenge"
                  : "Start Quest"
                : `Start ${isStrengthActivity ? "Counting" : "Tracking"}`}
            </CustomText>
          </TouchableOpacity>
        )
      )}
    </View>
  )
}



const ActivityScreen = ({ navigateToDashboard, navigateToMap, params = {} }) => {
  console.log("ActivityScreen: Initialized with params:", params)

  // State variables
  const [selectedActivity, setSelectedActivity] = useState(params.activityType || "walking")
  const [distance, setDistance] = useState(String(Number(params.distance) || 0))
  const [time, setTime] = useState(String(Number(params.time) || 0))
  const [calories, setCalories] = useState(0)
  const [coordinates, setCoordinates] = useState(params.coordinates || [])
  const [stats, setStats] = useState(
    params.stats || {
      distance: 0,
      duration: 0,
      pace: 0,
      avgSpeed: 0,
      steps: 0,
      reps: 0,
    }
  )

  // User stats
  const [userStats, setUserStats] = useState({
    level: 1,
    totalXP: 0,
  })

  // Quest state
  const [activeQuest, setActiveQuest] = useState(null)
  const [pulseAnim] = useState(new Animated.Value(1))

  // Settings and tracking states
  const [showSettings, setShowSettings] = useState(false)
  const [isViewingPastActivity, setIsViewingPastActivity] = useState(params.isViewingPastActivity || false)
  const [repCount, setRepCount] = useState(0)
  const [repGoal, setRepGoal] = useState(params.repGoal || 20)
  const [isTrackingReps, setIsTrackingReps] = useState(false)
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 })
  const [sensorSubscription, setSensorSubscription] = useState(null)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [showFaceCounter, setShowFaceCounter] = useState(false)
  const [gpsEnabled, setGpsEnabled] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalContent, setModalContent] = useState({
    title: "",
    message: "",
    type: "success",
    buttons: [],
  })
  const [showCountdown, setShowCountdown] = useState(false)

  // Animation refs
  const headerFadeAnim = useRef(new Animated.Value(0)).current
  const headerSlideAnim = useRef(new Animated.Value(-50)).current
  const cardFadeAnim = useRef(new Animated.Value(0)).current

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
        useNativeDriver: true,
      }),
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const handleModalClose = useCallback(() => {
    setModalVisible(false)
    if (modalContent.onCloseCallback) {
      modalContent.onCloseCallback()
    }
  }, [modalContent])

  const currentActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivity) || activities[0],
    [selectedActivity]
  )

  const isStrengthActivity = useMemo(() => !currentActivity.isGpsActivity, [currentActivity])

  // Load user stats
  const loadUserStats = useCallback(async () => {
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
      console.error("Error loading user stats:", error)
    }
  }, [])

  useEffect(() => {
    loadUserStats()
  }, [loadUserStats])

  // Format duration
  const formatDuration = useCallback((seconds) => {
    if (typeof seconds !== "number" || isNaN(seconds)) {
      seconds = 0
    }
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }, [])

  // Quest initialization
  useEffect(() => {
    const normalizedParams = params.questData ? { ...params.questData } : params

    if (normalizedParams.questId || (normalizedParams.title && normalizedParams.description && normalizedParams.unit)) {
      const questData = {
        id: normalizedParams.questId || `quest_${Date.now()}`,
        title: normalizedParams.title,
        description: normalizedParams.description,
        goal: normalizedParams.goal,
        unit: normalizedParams.unit,
        progress: normalizedParams.progress || 0,
        status: normalizedParams.status || "not_started",
        activityType: normalizedParams.activityType,
        difficulty: normalizedParams.difficulty || "medium",
        category: normalizedParams.category || "challenge",
        ...(normalizedParams.category === "challenge"
          ? { xpReward: 0, stakeXP: normalizedParams.stakeXP }
          : { xpReward: normalizedParams.xpReward || 50 }),
        mode: normalizedParams.mode,
        durationMinutes: normalizedParams.durationMinutes,
        startDate: normalizedParams.startDate,
        endDate: normalizedParams.endDate,
        groupType: normalizedParams.groupType || null,
        maxParticipants: normalizedParams.maxParticipants || null,
      }

      if (questData.mode === "time" && questData.durationMinutes) {
        if (questData.unit === "reps") {
          questData.goal = 1
        } else {
          questData.unit = "duration"
          questData.goal = questData.durationMinutes
        }
      } else if (!questData.goal || questData.goal === null) {
        questData.goal = questData.unit === "reps" ? repGoal : 1
      }

      setActiveQuest(questData)
      if (questData.activityType) {
        setSelectedActivity(questData.activityType)
      }
    } else {
      setActiveQuest(null)
    }
  }, [params, repGoal])

  const shouldDisableActivitySelection = useCallback(() => {
    return activeQuest && activeQuest.activityType
  }, [activeQuest])

  // NEW: Cancel Quest/Challenge Function
  const handleCancelQuest = useCallback(() => {
    const isChallenge = activeQuest?.category === 'challenge';
    const itemType = isChallenge ? 'Challenge' : 'Quest';

    showModal(
      `Cancel ${itemType}`,
      `Are you sure you want to cancel this ${itemType.toLowerCase()}? You'll return to the dashboard without completing it.`,
      null,
      "warning",
      [
        {
          label: `Keep ${itemType}`,
          style: "secondary",
          action: () => true,
        },
        {
          label: `Cancel ${itemType}`,
          style: "primary",
          action: () => {
            setActiveQuest(null);
            navigateToDashboard();
            return true;
          },
        },
      ]
    );
  }, [activeQuest, navigateToDashboard, showModal]);


  const calculateCalories = useCallback(() => {
    const weight = 70
    const timeInHours = (Number.parseFloat(time) || 0) / 60
    const activity = activities.find((a) => a.id === selectedActivity)
    const kcal = (activity?.met || 3.5) * weight * timeInHours
    return Math.round(kcal)
  }, [time, selectedActivity])

  useEffect(() => {
    setCalories(calculateCalories())
  }, [calculateCalories])

  const startAccelerometerTracking = useCallback(() => {
    Accelerometer.setUpdateInterval(100)
    let threshold = 1.2
    let resetThreshold = 0.8

    if (selectedActivity === "pushup") {
      threshold = 1.3
      resetThreshold = 0.9
    }

    const subscription = Accelerometer.addListener((data) => {
      setAccelerometerData(data)
      const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z)

      if (magnitude > threshold && !isTrackingReps) {
        setIsTrackingReps(true)
      } else if (magnitude < resetThreshold && isTrackingReps) {
        setIsTrackingReps(false)
        setRepCount((prev) => {
          const newCount = prev + 1
          Vibration.vibrate(50)
          return newCount
        })
        setStats((prevStats) => ({
          ...prevStats,
          reps: (prevStats.reps || 0) + 1,
        }))
      }
    })

    setSensorSubscription(subscription)
    return () => {
      subscription.remove()
    }
  }, [selectedActivity, isTrackingReps])

  const stopAccelerometerTracking = useCallback(() => {
    if (sensorSubscription) {
      sensorSubscription.remove()
      setSensorSubscription(null)
    }
  }, [sensorSubscription])

  const getDisplayQuestProgress = useCallback(
    (quest) => {
      if (!quest) return 0

      const initialProgressValue = (quest.progress || 0) * (quest.goal || 1)
      let currentSessionValue = 0

      if (quest.unit === "steps") {
        currentSessionValue = stats.steps
      } else if (quest.unit === "reps") {
        currentSessionValue = stats.reps
      } else if (quest.unit === "distance") {
        currentSessionValue = Number.parseFloat(stats.distance || 0) / 1000
      } else if (quest.unit === "duration") {
        currentSessionValue = stats.duration / 60
      } else if (quest.unit === "calories") {
        currentSessionValue = calories
      }

      const totalAchievedValue = initialProgressValue + currentSessionValue
      const goalValue = Number.parseFloat(quest.goal || 0)
      return goalValue > 0 ? Math.min(totalAchievedValue / goalValue, 1) : 0
    },
    [stats.steps, stats.distance, stats.reps, stats.duration, calories]
  )

  const showModal = useCallback((title, message, onCloseCallback, type = "success", buttons = []) => {
    setModalContent({
      title,
      message,
      type,
      buttons:
        buttons.length > 0
          ? buttons
          : [
            {
              label: "OK",
              style: "primary",
              action: () => {
                if (onCloseCallback) onCloseCallback()
                return true
              },
            },
          ],
    })
    setModalVisible(true)
  }, [])

  const saveActivity = useCallback(
    async (finalStats = null) => {
      setIsTrackingLoading(true)
      const activityStatsToSave = finalStats || stats || { reps: 0, duration: 0, distance: 0, steps: 0 }
      const strengthFlag = finalStats?.isStrengthActivity ?? isStrengthActivity
      const isTimerChallenge = activeQuest?.mode === "time"

      try {
        const user = auth.currentUser
        if (!user) {
          showModal("Error", "You must be logged in to save activities.")
          setIsTrackingLoading(false)
          return
        }

        // Validate activity data
        if (strengthFlag) {
          if (!isTimerChallenge) {
            const minReps = 5
            if ((activityStatsToSave.reps || 0) < minReps) {
              showModal(
                "Activity Too Short",
                `Your activity was too short to save. Please complete at least ${minReps} repetitions.`
              )
              setIsTrackingLoading(false)
              return
            }
          } else {
            if (activityStatsToSave.reps === undefined) {
              activityStatsToSave.reps = 0
            }
          }
        } else {
          const minDistance = 0.1
          const minDuration = 60
          const distanceInKm = (activityStatsToSave.distance || 0) / 1000

          if (distanceInKm < minDistance) {
            showModal("Activity Too Short", `Your activity was too short to save. Please cover at least ${minDistance} km.`)
            setIsTrackingLoading(false)
            return
          }

          if ((activityStatsToSave.duration || 0) < minDuration) {
            showModal(
              "Activity Too Short",
              `Your activity was too short to save. Please exercise for at least ${Math.floor(minDuration / 60)} minute(s).`
            )
            setIsTrackingLoading(false)
            return
          }
        }

        // Prepare activity data
        const activityData = {
          userId: user.uid,
          activityType: selectedActivity,
          duration: activityStatsToSave.duration || 0,
          calories: activityStatsToSave.calories || calories || 0,
          createdAt: serverTimestamp(),
          ...(strengthFlag
            ? {
              reps: activityStatsToSave.reps || 0,
              sets: activityStatsToSave.sets || 1,
            }
            : {
              distance: activityStatsToSave.distance || 0,
              steps: activityStatsToSave.steps || 0,
              coordinates: coordinates || [],
            }),
          questCompleted: getQuestStatus(activeQuest) === "completed",
        }

        const activityId = XPManager.generateActivityId(user.uid, Date.now(), selectedActivity)

        const activityParams = {
          activityType: selectedActivity,
          questId: activeQuest?.id || null,
          challengeId: activeQuest?.category === "challenge" ? activeQuest.id : null,
          category: activeQuest?.category || "normal",
          isChallenge: activeQuest?.category === "challenge",
          groupType: activeQuest?.groupType || null,
          mode: activeQuest?.mode || null,
        }

        const xpResult = await XPManager.awardXPForActivity({
          userId: user.uid,
          activityId,
          activityData,
          stats: activityStatsToSave,
          activityParams,
          questData: activeQuest,
          challengeData: activeQuest?.category === "challenge" ? activeQuest : null,
          isStrengthActivity: strengthFlag,
        })

        if (!xpResult.success) {
          showModal("Activity Not Saved", xpResult.reason || "Activity does not meet minimum requirements.")
          setIsTrackingLoading(false)
          return
        }

        // Badge system check
        let newBadges = []
        try {
          const existingBadges = await loadBadgesFromFirestore(user.uid)
          const userQuestHistory = await getUserQuestHistory(user.uid)

          const activitiesRef = collection(db, "activities")
          const questActivitiesRef = collection(db, "quest_activities")
          const challengeActivitiesRef = collection(db, "challenge_activities")

          const [allActivitiesSnap, allQuestActivitiesSnap, allChallengeActivitiesSnap] = await Promise.all([
            getDocs(query(activitiesRef, where("userId", "==", user.uid))),
            getDocs(query(questActivitiesRef, where("userId", "==", user.uid))),
            getDocs(query(challengeActivitiesRef, where("userId", "==", user.uid))),
          ])

          const allActivitiesData = [
            ...allActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
            ...allQuestActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
            ...allChallengeActivitiesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          ]

          const badgeStats = calculateBadgeStats(allActivitiesData, userQuestHistory)
          newBadges = evaluateBadges(badgeStats, existingBadges)

          if (newBadges.length > 0) {
            const updatedBadges = [...existingBadges, ...newBadges]
            await saveBadgesToFirestore(user.uid, updatedBadges)
          }
        } catch (badgeError) {
          console.error("Badge pipeline error:", badgeError)
        }

        // Build success message
        let successMessage = ""
        if (strengthFlag) {
          successMessage = `Awesome ${selectedActivity} session!\n\nWorkout Summary:\n• ${activityStatsToSave.reps} reps completed\n• ${formatDuration(
            activityStatsToSave.duration
          )} duration\n• ${activityStatsToSave.calories || calories} calories burned\n• ${xpResult.xpEarned} XP earned`
        } else {
          const distanceInKm = (activityStatsToSave.distance || 0) / 1000
          successMessage = `Great ${selectedActivity} session!\n\nWorkout Summary:\n• ${distanceInKm.toFixed(
            2
          )} km covered\n• ${formatDuration(activityStatsToSave.duration)} duration\n• ${xpResult.xpEarned} XP earned`
        }

        if (xpResult.questCompleted) {
          successMessage = `🎯 Congratulations! You completed the "${activeQuest?.title}" quest!\n\n${successMessage}`
        }

        if (xpResult.challengeCompleted) {
          successMessage = `💪 Challenge Completed! You earned bonus XP!\n\n${successMessage}`
        }

        if (xpResult.levelUp) {
          successMessage += `\n\n⭐ Level Up! You've reached level ${xpResult.newLevel}!`
        }

        showModal("Activity Saved", successMessage, () => {
          clearActivity()
          navigateToDashboard({ newlyEarnedBadges: newBadges })
        })
      } catch (error) {
        console.error("Error saving activity:", error)
        showModal("Error", "Failed to save activity. Please try again.")
      } finally {
        setIsTrackingLoading(false)
      }
    },
    [
      isStrengthActivity,
      selectedActivity,
      calories,
      activeQuest,
      stats,
      coordinates,
      navigateToDashboard,
      clearActivity,
      formatDuration,
      showModal,
      getQuestStatus,
    ]
  )

  const resumeTracking = useCallback(() => {
    const activityConfig = activities.find((a) => a.id === selectedActivity)
    if (!activityConfig.isGpsActivity) {
      startAccelerometerTracking()
      return
    }

    const validCoordinates = coordinates && coordinates.length > 0 ? coordinates : []
    const validStats = {
      distance: typeof stats.distance === "string" ? Number.parseFloat(stats.distance) : stats?.distance || 0,
      duration: stats?.duration || 0,
      pace: stats?.pace || 0,
      avgSpeed: stats?.avgSpeed || 0,
      steps: stats?.steps || 0,
      reps: stats?.reps || 0,
    }

    let currentQuestProgress = 0
    if (activeQuest) {
      currentQuestProgress = getDisplayQuestProgress(activeQuest)
    }

    navigateToMap({
      activityType: selectedActivity,
      activityColor: activityConfig.color,
      targetDistance: Number(distance) || 0,
      targetTime: Number(time) || 0,
      tracking: true,
      initialCoordinates: validCoordinates,
      initialStats: validStats,
      activeQuest: activeQuest,
      questProgress: currentQuestProgress,
      calories: calories,
      userStats: userStats,
      gpsEnabled: gpsEnabled,
      autoPauseEnabled: false,
      isViewingPastActivity: isViewingPastActivity,
      repCount: repCount,
      repGoal: repGoal,
    })
  }, [
    activities,
    selectedActivity,
    distance,
    time,
    coordinates,
    stats,
    navigateToMap,
    activeQuest,
    startAccelerometerTracking,
    calories,
    userStats,
    gpsEnabled,
    isViewingPastActivity,
    repCount,
    repGoal,
    getDisplayQuestProgress,
  ])

  const startActivity = useCallback(() => {
    const activityConfig = activities.find((a) => a.id === selectedActivity)
    if (activityConfig.isGpsActivity && !gpsEnabled) {
      alert("GPS Tracking is disabled. Please enable it to start the activity.")
      return
    }

    setStats({
      distance: 0,
      duration: 0,
      pace: 0,
      avgSpeed: 0,
      steps: 0,
      reps: 0,
    })
    setRepCount(0)
    setShowCountdown(true)
  }, [gpsEnabled, selectedActivity])

  const handleCountdownFinish = useCallback(() => {
    setShowCountdown(false)
    const activityConfig = activities.find((a) => a.id === selectedActivity)

    if (!activityConfig.isGpsActivity) {
      if (selectedActivity === "pushup") {
        setShowFaceCounter(true)
        return
      }
      startAccelerometerTracking()
      return
    }

    navigateToMap({
      activityType: selectedActivity,
      activityColor: activityConfig.color,
      targetDistance: Number(distance) || 0,
      targetTime: Number(time) || 0,
      tracking: false,
      initialCoordinates: [],
      initialStats: { distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0 },
      activeQuest: activeQuest,
      questProgress: activeQuest ? 0 : undefined,
      calories: 0,
      userStats: userStats,
      gpsEnabled: gpsEnabled,
      autoPauseEnabled: false,
      isViewingPastActivity: isViewingPastActivity,
      repCount: 0,
      repGoal: repGoal,
    })
  }, [
    selectedActivity,
    distance,
    time,
    navigateToMap,
    activeQuest,
    startAccelerometerTracking,
    userStats,
    isViewingPastActivity,
    repGoal,
    setShowFaceCounter,
    gpsEnabled,
  ])

  const clearActivity = useCallback(() => {
    setCoordinates([])
    setStats({ distance: 0, duration: 0, pace: 0, avgSpeed: 0, steps: 0, reps: 0 })
    setIsViewingPastActivity(false)
    setRepCount(0)
    stopAccelerometerTracking()
  }, [stopAccelerometerTracking])

  useEffect(() => {
    return () => {
      stopAccelerometerTracking()
    }
  }, [stopAccelerometerTracking])

  const getQuestStatus = useCallback(
    (quest) => {
      const progress = getDisplayQuestProgress(quest)
      if (progress >= 1) return "completed"
      if (progress > 0) return "in_progress"
      return "not_started"
    },
    [getDisplayQuestProgress]
  )

  const getCurrentQuestValue = useCallback(
    (quest) => {
      if (!quest) return 0

      const initialProgressValue = (quest.progress || 0) * (quest.goal || 1)
      let currentSessionValue = 0

      if (quest.unit === "steps") {
        currentSessionValue = stats.steps
      } else if (quest.unit === "reps") {
        currentSessionValue = stats.reps
      } else if (quest.unit === "distance") {
        currentSessionValue = Number.parseFloat(stats.distance || 0) / 1000
      } else if (quest.unit === "duration") {
        currentSessionValue = stats.duration / 60
      } else if (quest.unit === "calories") {
        currentSessionValue = calories
      }

      const totalAchievedValue = initialProgressValue + currentSessionValue
      const goalValue = Number.parseFloat(quest.goal || 0)
      return Math.min(totalAchievedValue, goalValue)
    },
    [stats.steps, stats.reps, stats.distance, stats.duration, calories]
  )

  const handleFaceCounterRep = useCallback((rep) => {
    setRepCount(rep)
    setStats((prevStats) => ({
      ...prevStats,
      reps: rep,
    }))
  }, [])

  const handleFaceCounterFinish = useCallback(
    (finalStatsFromCounter) => {
      setShowFaceCounter(false)

      if (finalStatsFromCounter) {
        setStats((prevStats) => ({
          ...prevStats,
          reps: finalStatsFromCounter.reps || 0,
          duration: finalStatsFromCounter.duration || 0,
          calories: finalStatsFromCounter.calories || 0,
        }))
      }

      if (finalStatsFromCounter) {
        saveActivity({ ...finalStatsFromCounter, isStrengthActivity: true })
      } else {
        saveActivity()
      }
    },
    [saveActivity]
  )

  if (showFaceCounter && selectedActivity === "pushup") {
    return (
      <FaceProximityPushUpCounter
        repGoal={activeQuest?.goal || repGoal}
        durationGoal={activeQuest?.durationMinutes || 0}
        stakeXP={activeQuest?.stakeXP || 0}
        onRepUpdate={handleFaceCounterRep}
        onFinish={handleFaceCounterFinish}
        activeQuest={activeQuest}
      />
    )
  }

  if (showCountdown) {
    return (
      <CountdownOverlay activityName={currentActivity.name} onCountdownFinish={handleCountdownFinish} />
    )
  }

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <ScrollView style={twrnc`flex-1`} contentContainerStyle={twrnc`pb-20`} showsVerticalScrollIndicator={false}>
        {/* HEADER SECTION */}
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
          <View style={[twrnc`absolute top-0 right-0 w-32 h-32`, { opacity: 0.08 }]}>
            <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
              {[...Array(16)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    twrnc`w-1/4 h-1/4 border`,
                    { borderColor: currentActivity.color, transform: [{ rotate: "45deg" }] },
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Header Content */}
          <View style={twrnc`relative z-10`}>
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center flex-1`}>
                <View style={twrnc`w-1 h-6 bg-[#FFC107] rounded-full mr-2.5`} />
                <View>
                  <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                    {activeQuest ? activeQuest.title : currentActivity.name}
                  </CustomText>
                  <View style={twrnc`flex-row items-center mt-1`}>
                    <View style={twrnc`bg-[#4361EE] rounded-full px-2 py-0.5 mr-2`}>
                      <CustomText weight="bold" style={twrnc`text-white text-[10px]`}>
                        Lvl {userStats.level}
                      </CustomText>
                    </View>
                    <View style={twrnc`bg-[#FFC107] rounded-full px-2 py-0.5`}>
                      <CustomText weight="bold" style={twrnc`text-[#0f172a] text-[10px]`}>
                        {userStats.totalXP} XP
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={twrnc`bg-[#0f172a] p-2 rounded-xl`}
                onPress={() => setShowSettings(!showSettings)}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Activity Icon */}
            <View style={twrnc`items-center mt-3`}>
              <View
                style={[
                  twrnc`w-28 h-28 rounded-3xl items-center justify-center`,
                  { backgroundColor: `${currentActivity.color}30` },
                ]}
              >
                <Image
                  source={currentActivity.icon}
                  style={[
                    twrnc`w-16 h-16`,
                    selectedActivity === 'pushup' && { tintColor: '#FFFFFF' }
                  ]}
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* MAIN CONTENT */}
        <Animated.View style={[twrnc`px-5`, { opacity: cardFadeAnim }]}>
          <View style={twrnc`h-4`} />

          {/* REP COUNTER (for strength activities during tracking) */}
          {isStrengthActivity && sensorSubscription && (
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-5 mb-5`}>
              <View style={twrnc`items-center`}>
                <CustomText style={twrnc`text-gray-400 text-xs mb-2`}>Reps Completed</CustomText>
                <CustomText weight="bold" style={twrnc`text-white text-5xl mb-1`}>
                  {repCount}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs`}>/ {activeQuest?.goal || repGoal}</CustomText>

                <View style={twrnc`w-full mt-4`}>
                  <View style={twrnc`h-2 bg-[#0f172a] rounded-full overflow-hidden`}>
                    <View
                      style={[
                        twrnc`h-full rounded-full`,
                        {
                          width: `${Math.min((repCount / (activeQuest?.goal || repGoal)) * 100, 100)}%`,
                          backgroundColor:
                            repCount >= (activeQuest?.goal || repGoal) ? "#06D6A0" : currentActivity.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ACTIVE QUEST CARD */}
          {activeQuest && (
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-5 mb-5 relative overflow-hidden`}>
              {/* Pattern */}
              <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`]}>
                <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                  {[...Array(16)].map((_, i) => (
                    <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#4361EE]`, { transform: [{ rotate: "45deg" }] }]} />
                  ))}
                </View>
              </View>

              <View style={twrnc`relative z-10`}>
                <View style={twrnc`flex-row items-center mb-3`}>
                  <View style={twrnc`w-0.5 h-4 bg-[#FFC107] rounded-full mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm flex-1`}>
                    {activeQuest.title}
                  </CustomText>
                  {activeQuest.category === "challenge" ? (
                    <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-full px-2.5 py-1`}>
                      <CustomText weight="bold" style={twrnc`text-[#FFC107] text-[10px]`}>
                        🏆 {activeQuest.stakeXP} XP
                      </CustomText>
                    </View>
                  ) : (
                    <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-full px-2.5 py-1`}>
                      <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-[10px]`}>
                        +{activeQuest.xpReward || 50} XP
                      </CustomText>
                    </View>
                  )}
                </View>

                <CustomText style={twrnc`text-gray-400 text-xs mb-4`}>{activeQuest.description}</CustomText>

                {/* Progress */}
                <View style={twrnc`bg-[#0f172a] rounded-xl p-3 mb-3`}>
                  <View style={twrnc`flex-row justify-between items-center mb-2`}>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Progress</CustomText>
                    <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                      {Math.round(getDisplayQuestProgress(activeQuest) * 100)}%
                    </CustomText>
                  </View>

                  <View style={twrnc`h-2 bg-[#1e293b] rounded-full overflow-hidden mb-2`}>
                    <View
                      style={[
                        twrnc`h-full rounded-full`,
                        {
                          width: `${Math.min(getDisplayQuestProgress(activeQuest) * 100, 100)}%`,
                          backgroundColor:
                            getDisplayQuestProgress(activeQuest) >= 1 ? "#06D6A0" : currentActivity.color,
                        },
                      ]}
                    />
                  </View>

                  <View style={twrnc`flex-row justify-between`}>
                    <View>
                      <CustomText style={twrnc`text-gray-500 text-[9px]`}>Current</CustomText>
                      <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                        {activeQuest.unit === "steps"
                          ? `${getCurrentQuestValue(activeQuest).toLocaleString()} steps`
                          : activeQuest.unit === "reps"
                            ? `${getCurrentQuestValue(activeQuest)} reps`
                            : activeQuest.unit === "distance"
                              ? `${getCurrentQuestValue(activeQuest).toFixed(2)} km`
                              : activeQuest.unit === "duration"
                                ? `${getCurrentQuestValue(activeQuest)} min`
                                : `${getCurrentQuestValue(activeQuest).toFixed(2)} km`}
                      </CustomText>
                    </View>
                    <View>
                      <CustomText style={twrnc`text-gray-500 text-[9px] text-right`}>Goal</CustomText>
                      <CustomText weight="bold" style={twrnc`text-white text-xs text-right`}>
                        {activeQuest.unit === "steps"
                          ? `${activeQuest.goal.toLocaleString()} steps`
                          : activeQuest.unit === "reps"
                            ? `${activeQuest.goal} reps`
                            : activeQuest.unit === "duration"
                              ? `${activeQuest.goal} min`
                              : `${activeQuest.goal} km`}
                      </CustomText>
                    </View>
                  </View>
                </View>

                {/* Cancel Quest Button */}
                <TouchableOpacity
                  style={[
                    twrnc` rounded-xl py-2.5 px-4 flex-row items-center justify-center`,
                    { backgroundColor: 'rgba(239, 71, 111, 0.1)' } 
                  ]}
                  onPress={handleCancelQuest}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle-outline" size={16} color="#EF476F" style={twrnc`mr-2`} />
                  <CustomText weight="bold" style={[twrnc`text-xs`, { color: '#EF476F' }]}>
                    {activeQuest?.category === 'challenge' ? 'Cancel Challenge' : 'Cancel Quest'}
                  </CustomText>
                </TouchableOpacity>



                {getQuestStatus(activeQuest) === "completed" && (
                  <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-xl p-3 mt-3 flex-row items-center`}>
                    <Ionicons name="checkmark-circle" size={20} color="#06D6A0" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-xs`}>
                      Quest Completed! Great job!
                    </CustomText>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ACTIVITY SELECTION - Only show if NO active quest */}
          {!showSettings && !activeQuest && (
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5`}>
              <View style={twrnc`flex-row items-center mb-3`}>
                <View style={twrnc`w-0.5 h-4 bg-[#4361EE] rounded-full mr-2`} />
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Choose Activity
                </CustomText>
              </View>

              <View style={twrnc`flex-row flex-wrap gap-3`}>
                {activities.map((activity) => (
                  <TouchableOpacity
                    key={activity.id}
                    style={[
                      twrnc`flex-1 min-w-[30%] rounded-2xl p-4 items-center border-2`,
                      {
                        backgroundColor: selectedActivity === activity.id ? `${activity.color}20` : '#0f172a',
                        borderColor: selectedActivity === activity.id ? activity.color : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      if (sensorSubscription) {
                        stopAccelerometerTracking()
                      }
                      setSelectedActivity(activity.id)
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        twrnc`w-12 h-12 rounded-xl items-center justify-center mb-2`,
                        { backgroundColor: selectedActivity === activity.id ? `${activity.color}30` : '#1e293b' },
                      ]}
                    >
                      <Image
                        source={activity.icon}
                        style={[
                          twrnc`w-7 h-7`,
                          activity.id === 'pushup' && { tintColor: '#FFFFFF' }
                        ]}
                        resizeMode="contain"
                      />
                    </View>
                    <CustomText
                      weight="semibold"
                      style={[
                        twrnc`text-xs text-center`,
                        { color: selectedActivity === activity.id ? activity.color : '#9CA3AF' },
                      ]}
                    >
                      {activity.name}
                    </CustomText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}


          {/* LOCKED ACTIVITY INFO - Only show if there IS an active quest */}
          {!showSettings && activeQuest && (
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5 border-2 border-[#FFC107]`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={[twrnc`w-12 h-12 rounded-xl items-center justify-center mr-3`, { backgroundColor: `${currentActivity.color}30` }]}>
                  <Image
                    source={currentActivity.icon}
                    style={[
                      twrnc`w-6 h-6`,
                      selectedActivity === 'pushup' && { tintColor: '#FFFFFF' }
                    ]}
                    resizeMode="contain"
                  />
                </View>
                <View style={twrnc`flex-1`}>
                  <View style={twrnc`flex-row items-center mb-1`}>
                    <Ionicons name="lock-closed" size={12} color="#FFC107" style={twrnc`mr-1`} />
                    <CustomText weight="bold" style={twrnc`text-[#FFC107] text-xs`}>
                      Quest Activity Locked
                    </CustomText>
                  </View>
                  <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                    {currentActivity.name}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-[10px]`}>
                    Required for {activeQuest?.title}
                  </CustomText>
                </View>
              </View>
            </View>
          )}

          {/* CURRENT PROGRESS */}
          {(coordinates.length > 0 || (isStrengthActivity && stats.reps > 0)) && (
            <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5`}>
              <View style={twrnc`flex-row items-center mb-3`}>
                <View style={twrnc`w-0.5 h-4 bg-[#06D6A0] rounded-full mr-2`} />
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Current Progress
                </CustomText>
              </View>

              <View style={twrnc`flex-row flex-wrap -mx-1`}>
                {isStrengthActivity ? (
                  <>
                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#9B5DE5] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons name="barbell-outline" size={18} color="#9B5DE5" />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {stats.reps || 0}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Reps</CustomText>
                      </View>
                    </View>

                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons name="time-outline" size={18} color="#FFC107" />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {formatDuration(stats.duration || 0).split(":")[0]}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Minutes</CustomText>
                      </View>
                    </View>

                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons name="flame-outline" size={18} color="#EF476F" />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {calories}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Calories</CustomText>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons name="map-outline" size={18} color="#4361EE" />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {(stats.distance / 1000).toFixed(2)}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>km</CustomText>
                      </View>
                    </View>

                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons name="time-outline" size={18} color="#FFC107" />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {formatDuration(stats.duration || 0).split(":")[0]}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>Minutes</CustomText>
                      </View>
                    </View>

                    <View style={twrnc`w-1/3 px-1 mb-3`}>
                      <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                        <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-full p-2 mb-2`}>
                          <Ionicons
                            name={selectedActivity === "cycling" ? "speedometer-outline" : "footsteps-outline"}
                            size={18}
                            color="#06D6A0"
                          />
                        </View>
                        <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                          {selectedActivity === "cycling" ? stats.avgSpeed.toFixed(1) : stats.steps.toLocaleString()}
                        </CustomText>
                        <CustomText style={twrnc`text-gray-400 text-[9px]`}>
                          {selectedActivity === "cycling" ? "km/h" : "Steps"}
                        </CustomText>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          {/* TIPS SECTION */}
          <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5`}>
            <View style={twrnc`flex-row items-center mb-3`}>
              <View style={twrnc`w-0.5 h-4 bg-[#FFC107] rounded-full mr-2`} />
              <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                Tips
              </CustomText>
            </View>

            {isStrengthActivity ? (
              selectedActivity === "pushup" ? (
                <View style={twrnc`gap-2`}>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      Place your phone flat on the ground facing up
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      Position your face above the camera when doing push-ups
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      The app will auto-detect your reps using face proximity
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      Blink during calibration to prove liveness detection
                    </CustomText>
                  </View>
                </View>
              ) : (
                <View style={twrnc`gap-2`}>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      Keep your phone in an accessible position for better motion detection
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      You can tap the + button to manually count reps if automatic detection isn't working
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                      Complete your quest goals to earn XP and track your fitness progress
                    </CustomText>
                  </View>
                </View>
              )
            ) : (
              <View style={twrnc`gap-2`}>
                <View style={twrnc`flex-row items-start`}>
                  <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                  <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                    Keep your phone in an accessible position for better GPS accuracy
                  </CustomText>
                </View>
                <View style={twrnc`flex-row items-start`}>
                  <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                  <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                    You can set optional goals or just start tracking without any targets
                  </CustomText>
                </View>
                <View style={twrnc`flex-row items-start`}>
                  <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                  <CustomText style={twrnc`text-gray-400 text-xs flex-1`}>
                    Complete your quest goals to earn XP and unlock achievements
                  </CustomText>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* ACTION BUTTONS */}
        <View style={twrnc`bg-0f172a`}>
          <ButtonSection
            coordinates={coordinates}
            isStrengthActivity={isStrengthActivity}
            stats={stats}
            sensorSubscription={sensorSubscription}
            isTrackingLoading={isTrackingLoading}
            currentActivity={currentActivity}
            activeQuest={activeQuest}
            resumeTracking={resumeTracking}
            saveActivity={saveActivity}
            clearActivity={clearActivity}
            startActivity={startActivity}
          />
        </View>
      </ScrollView>

      {/* SIMPLIFIED SETTINGS MODAL */}
      <Modal animationType="slide" transparent={true} visible={showSettings} onRequestClose={() => setShowSettings(false)}>
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-5 bg-[#4361EE] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                  Settings
                </CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* GPS Tracking */}
              <View style={twrnc`bg-[#0f172a] rounded-xl p-4 mb-3 flex-row items-center justify-between`}>
                <View style={twrnc`flex-1 mr-3`}>
                  <View style={twrnc`flex-row items-center mb-1`}>
                    <Ionicons name="navigate" size={16} color="#4361EE" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                      GPS Tracking
                    </CustomText>
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>Enable GPS for accurate distance tracking</CustomText>
                </View>
                <TouchableOpacity
                  style={[
                    twrnc`w-12 h-6 rounded-full flex-row items-center px-0.5`,
                    gpsEnabled ? twrnc`bg-[#06D6A0] justify-end` : twrnc`bg-gray-600 justify-start`,
                  ]}
                  onPress={() => setGpsEnabled(!gpsEnabled)}
                  activeOpacity={0.7}
                >
                  <View style={twrnc`w-5 h-5 bg-white rounded-full`} />
                </TouchableOpacity>
              </View>

              {/* App Info */}
              <View style={twrnc`bg-[#0f172a] rounded-xl p-4 mt-3`}>
                <CustomText weight="bold" style={twrnc`text-white text-sm mb-3`}>
                  About
                </CustomText>
                <View style={twrnc`flex-row justify-between mb-2`}>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>Version</CustomText>
                  <CustomText style={twrnc`text-white text-xs`}>1.0.0</CustomText>
                </View>
                <View style={twrnc`flex-row justify-between`}>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>Build</CustomText>
                  <CustomText style={twrnc`text-white text-xs`}>December 2025</CustomText>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CUSTOM MODAL */}
      <CustomModal {...modalContent} visible={modalVisible} onClose={handleModalClose} />
    </View>
  )
}

export default ActivityScreen

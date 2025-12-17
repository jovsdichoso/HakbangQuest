// FileName: /FaceProximityPushUpCounter.js
"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { View, TouchableOpacity, Dimensions, Vibration } from "react-native"
import { Camera as VisionCamera, useCameraDevice, useCameraPermission } from "react-native-vision-camera"
import { Camera } from "react-native-vision-camera-face-detector"
import { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated"
import Animated, { Easing } from "react-native-reanimated"
import { Accelerometer } from "expo-sensors"
import tw from "twrnc"
import CustomText from "./CustomText"
import { db, auth } from "../firebaseConfig"
import { addDoc, doc, getDoc, updateDoc, serverTimestamp, collection } from "firebase/firestore"
import CustomModal from "./CustomModal"

// Get responsive dimensions
const { width, height } = Dimensions.get("window")
const isSmallDevice = width < 375
const isMediumDevice = width >= 375 && width < 414
const isLargeDevice = width >= 414 && width < 768
const isTablet = width >= 768

// Responsive font sizes
const responsiveFontSizes = {
  xs: isSmallDevice ? 10 : isMediumDevice ? 11 : isLargeDevice ? 12 : 14,
  sm: isSmallDevice ? 12 : isMediumDevice ? 13 : isLargeDevice ? 14 : 16,
  base: isSmallDevice ? 14 : isMediumDevice ? 15 : isLargeDevice ? 16 : 18,
  lg: isSmallDevice ? 16 : isMediumDevice ? 18 : isLargeDevice ? 20 : 22,
  xl: isSmallDevice ? 18 : isMediumDevice ? 20 : isLargeDevice ? 22 : 24,
  "2xl": isSmallDevice ? 20 : isMediumDevice ? 22 : isLargeDevice ? 24 : 28,
  "3xl": isSmallDevice ? 36 : isMediumDevice ? 40 : isLargeDevice ? 44 : 48,
}

// Responsive padding/margin
const responsivePadding = {
  sm: isSmallDevice ? 2 : isMediumDevice ? 3 : isLargeDevice ? 4 : 5,
  base: isSmallDevice ? 4 : isMediumDevice ? 5 : isLargeDevice ? 6 : 8,
  lg: isSmallDevice ? 6 : isMediumDevice ? 8 : isLargeDevice ? 10 : 12,
}

// Accept repGoal, durationGoal, stakeXP, onRepUpdate, onFinish as props
export default function FaceProximityPushUpCounter({
  repGoal = 20,
  durationGoal = 0,
  stakeXP = 0,
  onRepUpdate,
  onFinish,
  activeQuest = null,
}) {
  const { hasPermission } = useCameraPermission()
  const [pushUpCount, setPushUpCount] = useState(0)
  const [currentState, setCurrentState] = useState("calibrating")
  const [calibrationCountdown, setCalibrationCountdown] = useState(3)
  const [debugInfo, setDebugInfo] = useState("")
  const [isFlat, setIsFlat] = useState(true)
  const [showDebug, setShowDebug] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [remainingSecs, setRemainingSecs] = useState(null)

  const [modalVisible, setModalVisible] = useState(false)
  const [modalContent, setModalContent] = useState({
    title: '',
    message: '',
    type: 'info',
    buttons: []
  })

  const device = useCameraDevice("front")
  const startTimeRef = useRef(null)
  const savedRef = useRef(false)
  const countdownIntervalRef = useRef(null)

  // Counter animation
  const counterScale = useSharedValue(1)
  const counterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(counterScale.value, { damping: 15, stiffness: 200 }) }],
  }))

  // Face size tracking
  const baselineFaceSize = useRef(0)
  const downThreshold = useRef(0)
  const upThreshold = useRef(0)
  const lastStateChange = useRef(0)
  const minStateChangeInterval = 600
  const calibrationSamples = useRef([])
  const recentFaceSizes = useRef([])
  const smoothingWindow = 3

  // Liveness detection
  const hasEyesOpen = useRef(false)
  const hasEyesClosed = useRef(false)

  // Format time for display (mm:ss)
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Accelerometer subscription for flatness
  useEffect(() => {
    let subscription
    const subscribe = () => {
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        const isOnGround = Math.abs(z) > 0.9 && Math.abs(x) < 0.2 && Math.abs(y) < 0.2
        setIsFlat(isOnGround)
      })
      Accelerometer.setUpdateInterval(500)
    }
    subscribe()
    return () => subscription && subscription.remove()
  }, [])

  useEffect(() => {
    ; (async () => {
      const status = await VisionCamera.requestCameraPermission()
      console.log(`Camera permission: ${status}`)
    })()
  }, [device])

  // Calibration countdown
  useEffect(() => {
    if (currentState === "calibrating" && calibrationCountdown > 0) {
      const timer = setTimeout(() => {
        setCalibrationCountdown((prev) => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (currentState === "calibrating" && calibrationCountdown === 0) {
      finishCalibration()
    }
  }, [currentState, calibrationCountdown])

  // Animate counter on increment
  useEffect(() => {
    counterScale.value = 1.2
    const timer = setTimeout(() => {
      counterScale.value = 1
    }, 200)
    return () => clearTimeout(timer)
  }, [pushUpCount])

  // Call onRepUpdate when reps change
  useEffect(() => {
    if (onRepUpdate) onRepUpdate(pushUpCount)
  }, [pushUpCount, onRepUpdate])

  // Start time when calibration finishes and counting begins
  useEffect(() => {
    if (currentState === "up" && startTimeRef.current === null) {
      startTimeRef.current = Date.now();

      // Start countdown timer if durationGoal is provided
      if (durationGoal && durationGoal > 0 && remainingSecs === null) {
        const initialSeconds = durationGoal * 60;
        setRemainingSecs(initialSeconds);

        // Start interval timer using ref for proper cleanup
        countdownIntervalRef.current = setInterval(() => {
          setRemainingSecs(prev => {
            if (prev <= 1) {
              clearInterval(countdownIntervalRef.current);
              // Auto-save when timer reaches 0 (only once)
              if (!savedRef.current) {
                savedRef.current = true;
                setTimeout(() => saveWorkout(), 500);
              }
              return 0;
            }

            // Vibration feedback for last 3 seconds
            if (prev <= 4 && prev > 1) {
              Vibration.vibrate(100);
            }

            return prev - 1;
          });
        }, 1000);
      }
    }
  }, [currentState, durationGoal]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const finishCalibration = () => {
    if (!isFlat) {
      setDebugInfo("⚠️ Place phone flat on the ground for calibration")
      setCalibrationCountdown(3)
      return
    }

    if (calibrationSamples.current.length > 10 && hasEyesOpen.current && hasEyesClosed.current) {
      const sortedSamples = [...calibrationSamples.current].sort((a, b) => a - b)
      const trimmedSamples = sortedSamples.slice(
        Math.floor(sortedSamples.length * 0.2),
        Math.floor(sortedSamples.length * 0.8),
      )

      baselineFaceSize.current = trimmedSamples.reduce((sum, size) => sum + size, 0) / trimmedSamples.length

      downThreshold.current = baselineFaceSize.current * 1.5
      upThreshold.current = baselineFaceSize.current * 1.2

      setCurrentState("up")
      setDebugInfo(`✅ Calibrated! Baseline: ${baselineFaceSize.current.toFixed(0)}`)
    } else {
      let msg = ""
      if (calibrationSamples.current.length <= 10) {
        msg = "Not enough samples - hold steady longer"
      } else if (!hasEyesOpen.current) {
        msg = "No open eyes detected - keep eyes open most of the time"
      } else if (!hasEyesClosed.current) {
        msg = "No closed eyes detected - please blink during calibration to prevent spoofing"
      }
      setDebugInfo(msg)
      setCalibrationCountdown(3)
      calibrationSamples.current = []
      hasEyesOpen.current = false
      hasEyesClosed.current = false
    }
  }

  const smoothFaceSize = (newSize) => {
    recentFaceSizes.current.push(newSize)
    if (recentFaceSizes.current.length > smoothingWindow) {
      recentFaceSizes.current.shift()
    }
    return recentFaceSizes.current.reduce((sum, size) => sum + size, 0) / recentFaceSizes.current.length
  }

  const detectPushUpFromFaceSize = (face) => {
    if (!isFlat) {
      setDebugInfo("⚠️ Phone not flat on ground! Push-ups blocked.")
      return
    }

    const currentTime = Date.now()
    const faceArea = face.bounds.width * face.bounds.height

    if (currentState === "calibrating") {
      calibrationSamples.current.push(faceArea)
      const leftEye = face.leftEyeOpenProbability ?? 1
      const rightEye = face.rightEyeOpenProbability ?? 1

      if (leftEye < 0.4 && rightEye < 0.4) {
        hasEyesClosed.current = true
      }
      if (leftEye > 0.7 && rightEye > 0.7) {
        hasEyesOpen.current = true
      }

      setDebugInfo(
        `Calibrating... ${calibrationCountdown}s\nSamples: ${calibrationSamples.current.length}\nCurrent size: ${faceArea.toFixed(0)}\nEyes Open: L:${leftEye.toFixed(2)} R:${rightEye.toFixed(2)}\nLiveness: Open ${hasEyesOpen.current ? "✅" : "❌"} Closed ${hasEyesClosed.current ? "✅" : "❌"}`,
      )
      return
    }

    const smoothedFaceSize = smoothFaceSize(faceArea)
    if (currentTime - lastStateChange.current < minStateChangeInterval) {
      return
    }

    const sizeRatio = smoothedFaceSize / baselineFaceSize.current

    setDebugInfo(
      `State: ${currentState.toUpperCase()}\n` +
      `Face Size: ${smoothedFaceSize.toFixed(0)}\n` +
      `Baseline: ${baselineFaceSize.current.toFixed(0)}\n` +
      `Ratio: ${sizeRatio.toFixed(2)}\n` +
      `Down Threshold: ${(downThreshold.current / baselineFaceSize.current).toFixed(2)}\n` +
      (isFlat ? "📱 Flat ✅" : "⚠️ Not Flat ❌"),
    )

    if (currentState === "up" && smoothedFaceSize > downThreshold.current) {
      setCurrentState("down")
      lastStateChange.current = currentTime
    } else if (currentState === "down" && smoothedFaceSize < upThreshold.current) {
      setCurrentState("up")
      setPushUpCount((prev) => prev + 1)
      lastStateChange.current = currentTime
    }
  }

  const resetCounter = () => {
    if (savedRef.current) return; // Prevent reset after auto-save

    setPushUpCount(0)
    setCurrentState("calibrating")
    setCalibrationCountdown(3)
    calibrationSamples.current = []
    recentFaceSizes.current = []
    baselineFaceSize.current = 0
    lastStateChange.current = 0
    hasEyesOpen.current = false
    hasEyesClosed.current = false
    startTimeRef.current = null
    savedRef.current = false;

    // Reset timer
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingSecs(null);
  }

  // Enhanced saveWorkout function
  const saveWorkout = useCallback(async () => {
    if (savedRef.current) return; // Prevent multiple saves
    savedRef.current = true;

    setIsSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setModalContent({
          title: "Error",
          message: "You must be logged in to save your workout.",
          type: "error",
          buttons: [{ label: "OK", style: "primary", action: () => true }],
        });
        setModalVisible(true);
        setIsSaving(false);
        return;
      }

      // Allow short activities for timer-based challenges
      const isTimerCompleted = durationGoal > 0;
      if (pushUpCount < 5 && !isTimerCompleted) {
        setModalContent({
          title: "Workout Too Short",
          message: "Please complete at least 5 push-ups to save your workout.",
          type: "info",
          buttons: [{ label: "OK", style: "primary", action: () => true }],
        });
        setModalVisible(true);
        setIsSaving(false);
        return;
      }

      const endTime = Date.now();
      const duration = startTimeRef.current
        ? Math.round((endTime - startTimeRef.current) / 1000)
        : 0;

      // Calculate XP and calories
      const calories = Math.round(pushUpCount * 0.5);
      const xpEarned = 50 + Math.floor(pushUpCount / 10) * 5;

      // 🧩 Detect active quest (if any)
      // You may already have activeQuest passed in as a prop
      // If not, get it from context or route params
      const questData = activeQuest
        ? {
          id: activeQuest.id,
          title: activeQuest.title,
          goal: activeQuest.goal,
          xpReward: activeQuest.xpReward,
          unit: activeQuest.unit,
          activityType: activeQuest.activityType,
        }
        : null;

      const activityParams = {
        type: questData ? "quest" : "normal",
        questId: questData ? questData.id : null,
        activityType: "pushup",
      };

      // ✅ Pass questData and activityParams in onFinish
      setModalContent({
        title: "Workout Saved!",
        message: `You completed ${pushUpCount} push-ups!\nCalories burned: ${calories}\nXP earned: ${xpEarned}`,
        type: "success",
        buttons: [
          {
            label: "OK",
            style: "primary",
            action: () => {
              if (onFinish) {
                const finalStats = {
                  reps: pushUpCount,
                  duration: duration,
                  calories: calories,
                  xpEarned: xpEarned,
                  activityType: "pushup",
                  unit: "reps",
                };

                onFinish({
                  ...finalStats,
                  questData,          // <-- 🔥 Pass quest info
                  activityParams,     // <-- 🔥 Pass activity type (quest/normal)
                });
              }
              resetCounter();
              return true;
            },
          },
        ],
      });

      setModalVisible(true);
    } catch (error) {
      setModalContent({
        title: "Failed to Save Workout",
        message: `An error occurred while saving your workout.\n\n${error?.message || "Please try again later."}`,
        type: "error",
        buttons: [{ label: "OK", style: "primary", action: () => true }],
      });
      setModalVisible(true);
      savedRef.current = false; // Allow retry on error
    } finally {
      setIsSaving(false);
    }
  }, [pushUpCount, durationGoal, onFinish, activeQuest]);


  const aFaceW = useSharedValue(0)
  const aFaceH = useSharedValue(0)
  const aFaceX = useSharedValue(0)
  const aFaceY = useSharedValue(0)

  const faceBoxStyle = useAnimatedStyle(() => ({
    position: "absolute",
    borderWidth: 4,
    borderColor: currentState === "down" ? "#ff3333" : currentState === "up" ? "#33ff33" : "#ffff33",
    borderRadius: 12,
    width: withTiming(aFaceW.value, { duration: 150, easing: Easing.inOut(Easing.ease) }),
    height: withTiming(aFaceH.value, { duration: 150, easing: Easing.inOut(Easing.ease) }),
    left: withTiming(aFaceX.value, { duration: 150, easing: Easing.inOut(Easing.ease) }),
    top: withTiming(aFaceY.value, { duration: 150, easing: Easing.inOut(Easing.ease) }),
  }))

  const resetButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(1, { duration: 100 }) }],
  }))

  const faceDetectionOptions = useRef({
    performanceMode: "accurate",
    landmarkMode: "none",
    contourMode: "none",
    classificationMode: "all",
    trackingEnabled: true,
    windowWidth: width,
    windowHeight: height,
    autoScale: true,
  }).current

  const handleFacesDetection = (faces) => {
    try {
      if (faces?.length > 0) {
        const face = faces[0]
        drawFaceBounds(face)
        detectPushUpFromFaceSize(face)
      } else {
        drawFaceBounds()
        if (currentState !== "calibrating") {
          setDebugInfo("❌ No face detected")
        }
      }
    } catch (error) {
      console.error("Error in face detection:", error)
      setDebugInfo(`Error: ${error}`)
    }
  }

  const drawFaceBounds = (face) => {
    if (face) {
      const { width, height, x, y } = face.bounds
      aFaceW.value = width
      aFaceH.value = height
      aFaceX.value = x
      aFaceY.value = y
    } else {
      aFaceW.value = aFaceH.value = aFaceX.value = aFaceY.value = 0
    }
  }

  if (!hasPermission) {
    return (
      <CustomText
        weight="medium"
        style={tw.style(`text-red-500 text-center bg-white/80 rounded-xl shadow-md`, {
          fontSize: responsiveFontSizes.lg,
          marginTop: responsivePadding.lg * 6,
          marginHorizontal: responsivePadding.lg,
          padding: responsivePadding.lg,
        })}
      >
        Camera permission is required.
      </CustomText>
    )
  }
  if (device == null) {
    return (
      <CustomText
        weight="medium"
        style={tw.style(`text-red-500 text-center bg-white/80 rounded-xl shadow-md`, {
          fontSize: responsiveFontSizes.lg,
          marginTop: responsivePadding.lg * 6,
          marginHorizontal: responsivePadding.lg,
          padding: responsivePadding.lg,
        })}
      >
        Camera device not found.
      </CustomText>
    )
  }

  return (
    <View style={tw`absolute inset-0 bg-black`}>
      {/* Animated Background Overlay */}
      <Animated.View
        style={tw.style(
          `absolute inset-0`,
          {
            backgroundColor: "#0f172a",
            opacity: 0.7,
          }
        )} />

      {/* Camera Feed */}
      <Camera
        style={tw`absolute inset-0`}
        device={device}
        isActive={!isSaving}
        faceDetectionCallback={handleFacesDetection}
        faceDetectionOptions={faceDetectionOptions}
        resizeMode="cover"
      />

      {/* Timer and Stake Display */}
      <View
        style={tw.style(
          `absolute top-4 left-0 right-0 flex-row justify-center items-center z-30`,
          {
            gap: responsivePadding.lg,
          }
        )}
      >
        {/* Timer Display */}
        {remainingSecs !== null && (
          <View
            style={tw.style(
              `bg-purple-600 rounded-2xl border-2 border-purple-300 shadow-lg px-4 py-2`,
              {
                minWidth: 80,
                alignItems: 'center',
              }
            )}
          >
            <CustomText
              weight="bold"
              style={tw.style(`text-white`, {
                fontSize: responsiveFontSizes.lg,
              })}
            >
              {formatTime(remainingSecs)}
            </CustomText>
          </View>
        )}

        {/* Stake Display */}
        {stakeXP > 0 && (
          <View
            style={tw.style(
              `bg-amber-600 rounded-2xl border-2 border-amber-300 shadow-lg px-4 py-2`,
              {
                minWidth: 80,
                alignItems: 'center',
              }
            )}
          >
            <CustomText
              weight="bold"
              style={tw.style(`text-white`, {
                fontSize: responsiveFontSizes.sm,
              })}
            >
              🏆 {stakeXP} XP
            </CustomText>
          </View>
        )}
      </View>

      {/* Scoreboard Counter */}
      <Animated.View
        style={tw.style(
          `absolute items-center w-full z-20`,
          {
            top: responsivePadding.lg * (remainingSecs !== null ? 8 : 2),
          }
        )}
      >
        <Animated.View
          style={[
            counterStyle,
            tw.style(
              `bg-black/90 rounded-3xl border-4 border-cyan-400 shadow-2xl px-8 py-4`,
              {
                elevation: 10,
              }
            ),
          ]}
        >
          <CustomText
            weight="bold"
            style={tw.style(`text-cyan-400 text-center`, {
              fontSize: responsiveFontSizes["3xl"],
              letterSpacing: 2,
              textShadowColor: "#22d3ee",
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 10,
            })}
          >
            {pushUpCount}
          </CustomText>
          <CustomText
            weight="semibold"
            style={tw.style(`text-cyan-200 text-center`, { fontSize: responsiveFontSizes.xl, marginTop: 2 })}
          >
            PUSH-UPS
          </CustomText>
          <CustomText
            weight="semibold"
            style={tw.style(`text-center`, {
              fontSize: responsiveFontSizes.lg,
              color: currentState === "down" ? "#f43f5e" : currentState === "up" ? "#22d3ee" : "#fde047",
              marginTop: 2,
            })}
          >
            {!isFlat
              ? "⚠️ NOT FLAT"
              : currentState === "calibrating"
                ? `CALIBRATING ${calibrationCountdown} ⏳`
                : currentState === "down"
                  ? "🔴 DOWN"
                  : "🟢 UP"}
          </CustomText>
        </Animated.View>
      </Animated.View>

      {/* Face Box Overlay */}
      <Animated.View style={faceBoxStyle} />

      {/* Info Panel */}
      <View
        style={tw.style(`absolute w-full items-center z-10`, {
          bottom: isSmallDevice ? responsivePadding.lg * 18 : responsivePadding.lg * 20,
        })}
      >
        <View
          style={tw.style(`bg-black/80 rounded-2xl border-2 border-cyan-400 shadow-lg px-6 py-4 w-[90%]`, {
            maxWidth: 400,
          })}
        >
          <CustomText
            weight="bold"
            style={tw.style(`text-cyan-300 text-center`, {
              fontSize: responsiveFontSizes.base,
              marginBottom: responsivePadding.base,
              letterSpacing: 1,
            })}
          >
            🎮 PUSH-UP QUEST
          </CustomText>
          <CustomText
            weight="regular"
            style={tw.style(`text-cyan-100 text-center`, {
              fontSize: responsiveFontSizes.sm,
              lineHeight: responsiveFontSizes.sm * 1.5,
            })}
            numberOfLines={5}
            ellipsizeMode="tail"
          >
            {currentState === "calibrating"
              ? "1. Place phone flat\n2. Get in position\n3. Blink a few times\n4. Hold steady to calibrate"
              : "✅ Ready! Do push-ups above the phone.\nFace size + flat phone triggers UP/DOWN."}
          </CustomText>
        </View>
      </View>

      {/* Debug Info */}
      {showDebug && (
        <View
          style={tw.style(`absolute w-full items-center z-10`, {
            bottom: responsivePadding.lg * 13,
          })}
        >
          <View
            style={tw.style(`bg-black/80 rounded-2xl border-2 border-cyan-400 shadow-lg px-4 py-2 w-[90%]`, {
              maxWidth: 400,
            })}
          >
            <CustomText
              weight="regular"
              style={tw.style(`text-cyan-200 text-center`, { fontSize: responsiveFontSizes.xs })}
            >
              {debugInfo}
            </CustomText>
          </View>
        </View>
      )}

      {/* Gaming Buttons - Always Accessible, Centered */}
      <View
        style={tw.style(`absolute w-full flex-row items-center justify-center z-30`, {
          bottom: responsivePadding.lg * 2,
          gap: responsivePadding.lg * 2,
        })}
      >
        {!savedRef.current && (
          <>
            <Animated.View style={resetButtonStyle}>
              <TouchableOpacity
                style={tw.style(
                  `bg-fuchsia-600 rounded-full border-4 border-fuchsia-300 shadow-2xl mx-2`,
                  {
                    paddingHorizontal: responsivePadding.lg * 2,
                    paddingVertical: responsivePadding.base * 1.5,
                    elevation: 10,
                  }
                )}
                onPress={resetCounter}
                activeOpacity={0.85}
                accessibilityLabel="Reset Counter"
                disabled={isSaving}
              >
                <CustomText weight="bold" style={tw.style(`text-white text-center`, { fontSize: responsiveFontSizes.lg })}>
                  RESET
                </CustomText>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={tw.style(
                `bg-emerald-600 rounded-full border-4 border-emerald-300 shadow-2xl mx-2`,
                {
                  paddingHorizontal: responsivePadding.lg * 2,
                  paddingVertical: responsivePadding.base * 1.5,
                  opacity: (isSaving || pushUpCount === 0) ? 0.6 : 1,
                  elevation: 10,
                }
              )}
              onPress={saveWorkout}
              disabled={isSaving || pushUpCount === 0}
              activeOpacity={0.85}
              accessibilityLabel="Save Activity"
            >
              <CustomText weight="bold" style={tw.style(`text-white text-center`, { fontSize: responsiveFontSizes.lg })}>
                {isSaving ? "SAVING..." : "SAVE ACTIVITY"}
              </CustomText>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Show Debug Button */}
      <TouchableOpacity
        style={tw.style(`absolute right-6 bottom-24 bg-cyan-700 rounded-full border-2 border-cyan-300 shadow-lg z-40`, {
          padding: responsivePadding.sm * 2,
        })}
        onPress={() => setShowDebug(!showDebug)}
        activeOpacity={0.85}
        accessibilityLabel="Toggle Debug Info"
      >
        <CustomText weight="bold" style={tw.style(`text-white`, { fontSize: responsiveFontSizes.sm })}>
          {showDebug ? "Hide Debug" : "Show Debug"}
        </CustomText>
      </TouchableOpacity>

      {/* Not Flat Warning */}
      {!isFlat && (
        <View
          style={tw.style(`absolute w-full items-center z-40`, {
            bottom: responsivePadding.lg * 8,
          })}
        >
          <View
            style={tw.style(`bg-fuchsia-700 rounded-2xl border-2 border-fuchsia-300 shadow-lg px-4 py-2 w-[90%]`, {
              maxWidth: 400,
            })}
          >
            <CustomText weight="bold" style={tw.style(`text-white text-center`, { fontSize: responsiveFontSizes.base })}>
              ⚠️ Keep phone flat on the ground!
            </CustomText>
          </View>
        </View>
      )}

      <CustomModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        buttons={modalContent.buttons}
      />
    </View>
  )
}
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
// ✅ FIX: Removed all 'firebase/firestore' imports. This component should not talk to the database.
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
  durationGoal = 0, // This is in minutes
  stakeXP = 0,
  onRepUpdate,
  onFinish,
  activeQuest = null,
}) {
  const { hasPermission } = useCameraPermission()
  const [pushUpCount, setPushUpCount] = useState(0)
  const [currentState, setCurrentState] = useState("calibrating")
  const [calibrationCountdown, setCalibrationCountdown] = useState(3)
  const [statusInfo, setStatusInfo] = useState("") // ✅ FIX: Renamed from debugInfo
  const [isFlat, setIsFlat] = useState(true)
  // const [showDebug, setShowDebug] = useState(false) // ✅ FIX: Removed debug state
  const [isFinished, setIsFinished] = useState(false) // ✅ FIX: Renamed 'isSaving' to 'isFinished'
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
  const finishReportedRef = useRef(false) // ✅ FIX: Prevents multiple 'onFinish' calls
  const countdownIntervalRef = useRef(null)

  // ✅ --- START OF FIX ---
  // Create a ref to hold the latest rep count.
  // This solves the "stale closure" problem in the timer.
  const repCountRef = useRef(pushUpCount);
  useEffect(() => {
    repCountRef.current = pushUpCount;
  }, [pushUpCount]);
  // ✅ --- END OF FIX ---


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
  
  // ✅ FIX: Replaced 'saveWorkout' with 'handleFinishWorkout'
  // This function NO LONGER saves to Firestore. It just bundles the
  // final stats and sends them to ActivityScreen via the onFinish prop.
  const handleFinishWorkout = useCallback(async (isCancel = false) => {
    if (finishReportedRef.current) return; // Prevent multiple finishes
    finishReportedRef.current = true;
    setIsFinished(true);

    // Stop the timer if it's running
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // ✅ FIX: Handle CANCEL button press
    if (isCancel) {
      console.log("[FaceCounter] Workout cancelled by user.");
      if (onFinish) {
        onFinish(null); // Send null to signal cancellation
      }
      return;
    }

    try {
      // ✅ --- START OF FIX ---
      // Read the rep count from the ref to get the LATEST value
      const finalRepCount = repCountRef.current;
      // ✅ --- END OF FIX ---

      // Allow short activities for timer-based challenges
      const isTimerChallenge = durationGoal > 0;
      // ✅ FIX: Allow 0 reps for timer challenge (winner-takes-all), but use finalRepCount
      if (finalRepCount < 1 && !isTimerChallenge) { // Changed minimum to 1 rep
        setModalContent({
          title: "Workout Too Short",
          message: "Please complete at least 1 push-up to finish your workout.",
          type: "info",
          buttons: [{ label: "OK", style: "primary", action: () => {
            finishReportedRef.current = false; // Allow retry
            setIsFinished(false);
            return true;
          } }],
        });
        setModalVisible(true);
        return;
      }

      const endTime = Date.now();
      const duration = startTimeRef.current
        ? Math.round((endTime - startTimeRef.current) / 1000)
        : 0;

      // Calculate calories
      const calories = Math.round(finalRepCount * 0.5); // ✅ FIX: Use finalRepCount

      // ✅ Bundle the final stats for ActivityScreen
      const finalStats = {
        reps: finalRepCount, // ✅ FIX: Use finalRepCount
        duration: duration, // Send total duration
        calories: calories,
        activityType: "pushup",
        unit: "reps",
        // This flag tells ActivityScreen's saveActivity it was a strength workout
        isStrengthActivity: true, 
      };

      console.log("[FaceCounter] Finishing workout. Sending stats to parent:", finalStats);

      // ✅ Pass all data back to ActivityScreen to handle saving
      if (onFinish) {
        onFinish(finalStats);
      }

      // We don't show a modal here. ActivityScreen will show the "Activity Saved" modal.

    } catch (error) {
      setModalContent({
        title: "Error Finishing Workout",
        message: `An error occurred.\n\n${error?.message || "Please try again later."}`,
        type: "error",
        buttons: [{ label: "OK", style: "primary", action: () => true }],
      });
      setModalVisible(true);
      finishReportedRef.current = false; // Allow retry on error
      setIsFinished(false);
    }
    // ✅ --- START OF FIX ---
    // Removed 'pushUpCount' from dependency array, as we now use the ref.
  }, [durationGoal, onFinish]);
  // ✅ --- END OF FIX ---


  // ✅ FIX: Cleaned up timer and auto-finish logic
  useEffect(() => {
    if (currentState === "up" && startTimeRef.current === null) {
      startTimeRef.current = Date.now();

      // Start challenge countdown timer if durationGoal is provided
      if (durationGoal && durationGoal > 0 && remainingSecs === null) {
        const initialSeconds = durationGoal * 60;
        setRemainingSecs(initialSeconds);
        console.log(`[FaceCounter] Starting ${initialSeconds}s timer.`);

        countdownIntervalRef.current = setInterval(() => {
          setRemainingSecs(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
              
              console.log("[FaceCounter] Timer finished. Auto-finishing workout.");
              Vibration.vibrate(500); // Long vibration on finish
              
              // Auto-finish when timer reaches 0
              handleFinishWorkout(false); // Pass false to indicate not a cancel
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
  }, [currentState, durationGoal, remainingSecs, handleFinishWorkout]); // Added handleFinishWorkout to dep array

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
      setStatusInfo("⚠️ Place phone flat on the ground for calibration")
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
      setStatusInfo(`✅ Calibrated! Baseline: ${baselineFaceSize.current.toFixed(0)}`)
    } else {
      let msg = ""
      if (calibrationSamples.current.length <= 10) {
        msg = "Not enough samples - hold steady longer"
      } else if (!hasEyesOpen.current) {
        msg = "No open eyes detected - keep eyes open"
      } else if (!hasEyesClosed.current) {
        msg = "No closed eyes detected - please blink"
      }
      setStatusInfo(msg)
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
      setStatusInfo("⚠️ Phone not flat. Paused.")
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
      
      // ✅ FIX: Simplified status info
      setStatusInfo(`Calibrating... ${calibrationCountdown}s\nBlink to prove liveness.`)
      return
    }

    const smoothedFaceSize = smoothFaceSize(faceArea)
    if (currentTime - lastStateChange.current < minStateChangeInterval) {
      return
    }
    
    // ✅ FIX: Simplified status info
    setStatusInfo(isFlat ? "✅ Ready" : "⚠️ Phone not flat. Paused.")

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
    if (isFinished) return; // Prevent reset after finish

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
    finishReportedRef.current = false;

    // Reset timer
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingSecs(null);
  }

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
      if (isFinished) return; // Stop processing if finished

      if (faces?.length > 0) {
        const face = faces[0]
        drawFaceBounds(face)
        detectPushUpFromFaceSize(face)
      } else {
        drawFaceBounds()
        if (currentState !== "calibrating") {
          setStatusInfo("❌ No face detected. Move closer.") // ✅ FIX: Clearer message
        }
      }
    } catch (error) {
      console.error("Error in face detection:", error)
      setStatusInfo(`Error: ${error}`) // ✅ FIX: Use statusInfo
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
        isActive={!isFinished} // ✅ FIX: Use 'isFinished'
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
            // Use safe area top padding if available
            paddingTop: responsivePadding.base,
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
            // Adjust top position based on timer/stake visibility
            top: (remainingSecs !== null || stakeXP > 0) ? responsivePadding.lg * 8 : responsivePadding.lg * 2,
          }
        )}
      >
        <Animated.View
          style={[
            counterStyle,
            tw.style(
              `bg-black/90 rounded-3xl border-4 border-cyan-400 shadow-2xl px-8 py-4 items-center`, // ✅ FIX: Added items-center
              {
                elevation: 10,
                minWidth: 240, // ✅ FIX: Give it a minimum width
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
          
          {/* ✅ FIX: Moved statusInfo into the scoreboard */}
          {statusInfo.length > 0 && currentState !== "calibrating" && (
             <CustomText
              weight="medium"
              style={tw.style(`text-yellow-300 text-center`, { 
                fontSize: responsiveFontSizes.sm, 
                marginTop: 8,
              })}
            >
              {statusInfo}
            </CustomText>
          )}

        </Animated.View>
      </Animated.View>

      {/* Face Box Overlay */}
      <Animated.View style={faceBoxStyle} />

      {/* ✅ FIX: Removed Info Panel */}
      {/* ✅ FIX: Removed Debug Info Panel */}

      {/* Gaming Buttons - Always Accessible, Centered */}
      <View
        style={tw.style(`absolute w-full flex-row items-center justify-center z-30`, {
          bottom: responsivePadding.lg * 2,
          gap: responsivePadding.lg * 2,
        })}
      >
        {/* ✅ FIX: Updated button logic */}
        {!isFinished && (
          <>
            {/* --- Challenge Mode (Timer) --- */}
            {durationGoal > 0 && (
              <TouchableOpacity
                style={tw.style(
                  `bg-red-600 rounded-full border-4 border-red-300 shadow-2xl mx-2`,
                  {
                    paddingHorizontal: responsivePadding.lg * 2,
                    paddingVertical: responsivePadding.base * 1.5,
                    elevation: 10,
                  }
                )}
                onPress={() => {
                  handleFinishWorkout(true); // Pass true to signal cancellation
                }}
                activeOpacity={0.85}
                accessibilityLabel="Cancel Challenge"
              >
                <CustomText weight="bold" style={tw.style(`text-white text-center`, { fontSize: responsiveFontSizes.lg })}>
                  CANCEL
                </CustomText>
              </TouchableOpacity>
            )}

            {/* --- Practice Mode (No Timer) --- */}
            {(durationGoal === 0 || !durationGoal) && (
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
                    disabled={isFinished}
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
                      opacity: (isFinished || (pushUpCount === 0 && !durationGoal)) ? 0.6 : 1,
                      elevation: 10,
                    }
                  )}
                  onPress={() => handleFinishWorkout(false)} // Pass false to signal not a cancel
                  disabled={isFinished || (pushUpCount === 0 && !durationGoal)}
                  activeOpacity={0.85}
                  accessibilityLabel="Finish Activity"
                >
                  <CustomText weight="bold" style={tw.style(`text-white text-center`, { fontSize: responsiveFontSizes.lg })}>
                    {isFinished ? "FINISHED" : "FINISH"} 
                  </CustomText>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>

      {/* ✅ FIX: Removed Show Debug Button */}

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


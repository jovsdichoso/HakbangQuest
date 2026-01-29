"use client"

import { useState, useEffect, useRef } from "react"
import {
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import CustomModal from "../components/CustomModal"
import { auth, db } from "../firebaseConfig"
import NotificationService from "../services/NotificationService"
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { FontAwesome, Ionicons } from "@expo/vector-icons"

const { width } = Dimensions.get("window")
const isSmallDevice = width < 375

const SignupScreen = ({ navigateToLanding, navigateToSignIn, setIsInSignupFlow, setIsNavigationLocked }) => {
  // Form states
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [bmi, setBmi] = useState(null)
  const [fitnessGoal, setFitnessGoal] = useState("")
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: "", color: "" })

  // UI states
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [isUsernameFocused, setIsUsernameFocused] = useState(false)
  const [isEmailFocused, setIsEmailFocused] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [isConfirmPasswordFocused, setIsConfirmPasswordFocused] = useState(false)
  const [isHeightFocused, setIsHeightFocused] = useState(false)
  const [isWeightFocused, setIsWeightFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [errors, setErrors] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    height: "",
    weight: "",
  })

  // Modal states
  const [modalVisible, setModalVisible] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalMessage, setModalMessage] = useState("")
  const [modalType, setModalType] = useState("success")

  // Refs
  const scrollViewRef = useRef(null)
  const emailInputRef = useRef(null)
  const passwordInputRef = useRef(null)
  const confirmPasswordInputRef = useRef(null)
  const weightInputRef = useRef(null)

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const headerSlideAnim = useRef(new Animated.Value(-50)).current
  const buttonScaleAnim = useRef(new Animated.Value(1)).current
  const inputShakeAnim = useRef(new Animated.Value(0)).current
  const stepTransitionAnim = useRef(new Animated.Value(0)).current

  // Bubble animations for each step
  const bubbleAnims = [
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
  ]
  const bubbleOpacity = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ]

  // Fitness goals options
  const fitnessGoals = [
    { id: "weight_loss", label: "Weight Loss", icon: "trending-down", color: "#EF476F" },
    { id: "muscle_gain", label: "Muscle Gain", icon: "barbell", color: "#06D6A0" },
    { id: "endurance", label: "Endurance", icon: "heart", color: "#4361EE" },
    { id: "general_fitness", label: "General Fitness", icon: "star", color: "#FFC107" },
  ]

  // Password strength evaluation
  const evaluatePasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: "", color: "" }

    let score = 0

    // Check password length
    if (pass.length >= 8) score += 1
    if (pass.length >= 12) score += 1
    // Contains lowercase
    if (/[a-z]/.test(pass)) score += 1
    // Contains uppercase
    if (/[A-Z]/.test(pass)) score += 1
    // Contains number
    if (/[0-9]/.test(pass)) score += 1
    // Contains special character
    if (/[^A-Za-z0-9]/.test(pass)) score += 1

    let label = ""
    let color = ""

    if (score <= 2) {
      label = "Weak"
      color = "#EF476F"
    } else if (score <= 4) {
      label = "Medium"
      color = "#FFC107"
    } else {
      label = "Strong"
      color = "#06D6A0"
    }

    return { score, label, color }
  }

  // Lock navigation when modal is open
  useEffect(() => {
    if (modalVisible) {
      setIsNavigationLocked(true)
    } else {
      setIsNavigationLocked(false)
    }
  }, [modalVisible, setIsNavigationLocked])

  // Entrance animations and keyboard listeners
  useEffect(() => {
    animateScreenElements()

    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height)
      }
    )

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0)
      }
    )

    return () => {
      keyboardWillShow.remove()
      keyboardWillHide.remove()
    }
  }, [])

  // BMI calculation
  useEffect(() => {
    if (height && weight) {
      const heightInMeters = parseFloat(height) / 100
      const weightInKg = parseFloat(weight)
      if (heightInMeters > 0 && weightInKg > 0) {
        const calculatedBmi = weightInKg / (heightInMeters * heightInMeters)
        setBmi(calculatedBmi.toFixed(1))
      }
    }
  }, [height, weight])

  // Trigger bubble animation when step changes
  useEffect(() => {
    animateBubble(currentStep - 1)
  }, [currentStep])

  const animateScreenElements = () => {
    fadeAnim.setValue(0)
    slideAnim.setValue(50)
    headerSlideAnim.setValue(-50)

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }

  const animateBubble = (index) => {
    // Reset previous bubbles
    bubbleOpacity.forEach((anim, i) => {
      if (i !== index) {
        anim.setValue(0)
      }
    })

    // Animate current bubble
    Animated.parallel([
      Animated.sequence([
        Animated.timing(bubbleAnims[index], {
          toValue: 1.3,
          duration: 400,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleAnims[index], {
          toValue: 1,
          duration: 300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(bubbleOpacity[index], {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(bubbleOpacity[index], {
          toValue: 0,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }

  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start()
  }

  const animateInputError = () => {
    Animated.sequence([
      Animated.timing(inputShakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start()
  }

  const animateStepTransition = () => {
    Animated.sequence([
      Animated.timing(stepTransitionAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(stepTransitionAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }

  // Validation functions
  const validateStep1 = () => {
    const newErrors = { username: "", email: "", password: "", confirmPassword: "" }
    let hasError = false

    if (!username.trim()) {
      newErrors.username = "Username is required"
      hasError = true
    }

    if (!email.trim()) {
      newErrors.email = "Email is required"
      hasError = true
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Invalid email format"
      hasError = true
    }

    if (!password) {
      newErrors.password = "Password is required"
      hasError = true
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters"
      hasError = true
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password"
      hasError = true
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
      hasError = true
    }

    setErrors({ ...errors, ...newErrors })
    return !hasError
  }

  const validateStep2 = () => {
    const newErrors = { height: "", weight: "" }
    let hasError = false

    if (!height.trim()) {
      newErrors.height = "Height is required"
      hasError = true
    } else if (isNaN(parseFloat(height)) || parseFloat(height) <= 0) {
      newErrors.height = "Please enter a valid height"
      hasError = true
    }

    if (!weight.trim()) {
      newErrors.weight = "Weight is required"
      hasError = true
    } else if (isNaN(parseFloat(weight)) || parseFloat(weight) <= 0) {
      newErrors.weight = "Please enter a valid weight"
      hasError = true
    }

    setErrors({ ...errors, ...newErrors })
    return !hasError
  }

  const handleNextStep = () => {
    Keyboard.dismiss()
    if (currentStep === 1 && validateStep1()) {
      animateStepTransition()
      setTimeout(() => setCurrentStep(2), 150)
    } else if (currentStep === 2 && validateStep2()) {
      animateStepTransition()
      setTimeout(() => setCurrentStep(3), 150)
    } else if (currentStep === 1 || currentStep === 2) {
      animateInputError()
    }
  }

  const handlePrevStep = () => {
    Keyboard.dismiss()
    if (currentStep > 1) {
      animateStepTransition()
      setTimeout(() => setCurrentStep(currentStep - 1), 150)
    } else {
      navigateToSignIn()
    }
  }

  const validateAndSignUp = async () => {
    if (!fitnessGoal) {
      setModalTitle("Selection Required")
      setModalMessage("Please select a fitness goal to continue.")
      setModalType("warning")
      setModalVisible(true)
      return
    }
    await handleEmailSignUp()
  }

  const handleEmailSignUp = async () => {
    animateButtonPress()
    setIsLoading(true)
    Keyboard.dismiss()

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      await setDoc(doc(db, "users", user.uid), {
        username,
        email,
        avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",

        height: parseFloat(height),
        weight: parseFloat(weight),
        bmi: parseFloat(bmi),
        fitnessGoal,

        createdAt: new Date(),

        hasSeenIntro: false,

        level: 1,
        totalXP: 0,

        totalActivities: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalReps: 0,
        totalStrengthDuration: 0,
        totalCalories: 0,

        avgDailyDistance: 0,
        avgActiveDuration: 0,
        avgDailyReps: 0,

        achievements: [],
        badges: [],
        friends: [],

        privacySettings: {
          showProfile: true,
          showActivities: true,
          showStats: true,
        },

        isOnline: false,
        lastSeen: new Date(),
        lastActivityDate: null,
        lastQuestCompleted: null,
      });

      const storedEmails = await AsyncStorage.getItem("registeredEmails")
      const emails = storedEmails ? JSON.parse(storedEmails) : []
      if (!emails.includes(email)) {
        emails.push(email)
        await AsyncStorage.setItem("registeredEmails", JSON.stringify(emails))
      }

      setModalTitle("Account Created Successfully!")
      setModalMessage("Your HakbangQuest account has been created. Please verify your email before logging in.")
      setModalType("success")
      setModalVisible(true)

      await sendEmailVerification(user)
      await NotificationService.sendVerifyAccountNotification()
    } catch (error) {
      setModalTitle("Sign Up Failed")
      setModalMessage(getErrorMessage(error.code))
      setModalType("error")
      setModalVisible(true)
    } finally {
      setIsLoading(false)
    }
  }

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/email-already-in-use":
        return "An account with this email already exists."
      case "auth/invalid-email":
        return "Please enter a valid email address."
      case "auth/weak-password":
        return "Password should be at least 8 characters."
      default:
        return "Failed to create account. Please try again."
    }
  }

  const handleModalClose = () => {
    setModalVisible(false)
    if (modalType === "success") {
      navigateToSignIn(email)
    }
  }

  const getBmiCategory = (bmiValue) => {
    const bmiNum = parseFloat(bmiValue)
    if (bmiNum < 18.5) return { category: "Underweight", color: "#FFD166" }
    if (bmiNum < 25) return { category: "Normal", color: "#06D6A0" }
    if (bmiNum < 30) return { category: "Overweight", color: "#FFC107" }
    return { category: "Obese", color: "#EF476F" }
  }

  const renderStepIndicator = () => (
    <View style={twrnc`flex-row items-center justify-center mb-8`}>
      {[1, 2, 3].map((step, index) => (
        <View key={step} style={twrnc`flex-row items-center`}>
          <View style={twrnc`relative`}>
            {/* Bubble effect */}
            <Animated.View
              style={[
                twrnc`absolute w-16 h-16 rounded-full`,
                {
                  backgroundColor: "#6366f1",
                  opacity: bubbleOpacity[index],
                  transform: [{ scale: bubbleAnims[index] }],
                  top: -12,
                  left: -12,
                },
              ]}
            />

            <Animated.View
              style={[
                twrnc`w-10 h-10 rounded-full items-center justify-center z-10`,
                currentStep >= step
                  ? twrnc`bg-indigo-600 border-2 border-indigo-600`
                  : twrnc`bg-[#1e293b] border-2 border-gray-600`,
                {
                  transform: [{ scale: currentStep === step ? bubbleAnims[index] : 1 }],
                },
              ]}
            >
              {currentStep > step ? (
                <Ionicons name="checkmark" size={20} color="white" />
              ) : (
                <CustomText style={twrnc`text-white font-bold`}>{step}</CustomText>
              )}
            </Animated.View>
          </View>
          {step !== 3 && (
            <View style={[twrnc`w-16 h-1 mx-2`, currentStep > step ? twrnc`bg-indigo-600` : twrnc`bg-gray-600`]} />
          )}
        </View>
      ))}
    </View>
  )

  const renderStep1 = () => (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { translateX: inputShakeAnim }],
        },
      ]}
    >
      <View style={twrnc`mb-6`}>
        <CustomText style={twrnc`text-2xl font-bold text-white mb-2`}>Create Account</CustomText>
        <CustomText style={twrnc`text-sm text-gray-400`}>Let's create your HakbangQuest account</CustomText>
      </View>

      {/* Username Input */}
      <View style={twrnc`mb-5`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Username</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isUsernameFocused && twrnc`border-2 border-indigo-500`,
            errors.username && twrnc`border-2 border-red-500`,
            !isUsernameFocused && !errors.username && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="person-outline" size={20} color={isUsernameFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Enter your username"
            placeholderTextColor="#6b7280"
            value={username}
            onChangeText={(text) => {
              setUsername(text)
              if (errors.username) setErrors((prev) => ({ ...prev, username: "" }))
            }}
            onFocus={() => setIsUsernameFocused(true)}
            onBlur={() => setIsUsernameFocused(false)}
            returnKeyType="next"
            onSubmitEditing={() => emailInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>
        {errors.username && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.username}</CustomText>}
      </View>

      {/* Email Input */}
      <View style={twrnc`mb-5`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Email Address</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isEmailFocused && twrnc`border-2 border-indigo-500`,
            errors.email && twrnc`border-2 border-red-500`,
            !isEmailFocused && !errors.email && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="mail-outline" size={20} color={isEmailFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            ref={emailInputRef}
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Enter your email"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={(text) => {
              setEmail(text)
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }))
            }}
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => setIsEmailFocused(false)}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>
        {errors.email && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.email}</CustomText>}
      </View>

      {/* Password Input */}
      <View style={twrnc`mb-4`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Password</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isPasswordFocused && twrnc`border-2 border-indigo-500`,
            errors.password && twrnc`border-2 border-red-500`,
            !isPasswordFocused && !errors.password && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={20} color={isPasswordFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            ref={passwordInputRef}
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Enter your password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={(text) => {
              setPassword(text)
              setPasswordStrength(evaluatePasswordStrength(text))
              if (errors.password) setErrors((prev) => ({ ...prev, password: "" }))
            }}
            secureTextEntry={!isPasswordVisible}
            onFocus={() => {
              setIsPasswordFocused(true)
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
            }}
            onBlur={() => setIsPasswordFocused(false)}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={twrnc`p-2`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={isPasswordVisible ? "eye-off-outline" : "eye-outline"} size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        {errors.password && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.password}</CustomText>}

        {/* Password Strength Indicator */}
        {password.length > 0 && (
          <View style={twrnc`mt-3`}>
            <View style={twrnc`flex-row items-center justify-between mb-2`}>
              <CustomText style={twrnc`text-xs text-gray-400`}>Password Strength</CustomText>
              <CustomText style={[twrnc`text-xs font-bold`, { color: passwordStrength.color }]}>
                {passwordStrength.label}
              </CustomText>
            </View>
            <View style={twrnc`flex-row gap-1`}>
              {[1, 2, 3, 4, 5, 6].map((bar) => (
                <View
                  key={bar}
                  style={[
                    twrnc`flex-1 h-1.5 rounded-full`,
                    bar <= passwordStrength.score
                      ? { backgroundColor: passwordStrength.color }
                      : twrnc`bg-gray-700`,
                  ]}
                />
              ))}
            </View>
            <View style={twrnc`mt-2`}>
              <CustomText style={twrnc`text-xs text-gray-500`}>
                • At least 8 characters {password.length >= 8 && "✓"}
              </CustomText>
              <CustomText style={twrnc`text-xs text-gray-500`}>
                • Uppercase & lowercase {/[a-z]/.test(password) && /[A-Z]/.test(password) && "✓"}
              </CustomText>
              <CustomText style={twrnc`text-xs text-gray-500`}>
                • Number & special character {/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) && "✓"}
              </CustomText>
            </View>
          </View>
        )}
      </View>

      {/* Confirm Password Input */}
      <View style={twrnc`mb-4`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Confirm Password</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isConfirmPasswordFocused && twrnc`border-2 border-indigo-500`,
            errors.confirmPassword && twrnc`border-2 border-red-500`,
            !isConfirmPasswordFocused && !errors.confirmPassword && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={20} color={isConfirmPasswordFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            ref={confirmPasswordInputRef}
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Re-enter your password"
            placeholderTextColor="#6b7280"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text)
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }))
            }}
            secureTextEntry={!isConfirmPasswordVisible}
            onFocus={() => {
              setIsConfirmPasswordFocused(true)
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
            }}
            onBlur={() => setIsConfirmPasswordFocused(false)}
            returnKeyType="done"
            onSubmitEditing={handleNextStep}
          />
          <TouchableOpacity
            onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
            style={twrnc`p-2`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={isConfirmPasswordVisible ? "eye-off-outline" : "eye-outline"} size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        {errors.confirmPassword && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.confirmPassword}</CustomText>}
        {confirmPassword && password === confirmPassword && (
          <View style={twrnc`flex-row items-center mt-1.5 ml-1`}>
            <Ionicons name="checkmark-circle" size={14} color="#06D6A0" style={twrnc`mr-1`} />
            <CustomText style={twrnc`text-xs text-green-400`}>Passwords match</CustomText>
          </View>
        )}
      </View>
    </Animated.View>
  )

  const renderStep2 = () => (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { translateX: inputShakeAnim }],
        },
      ]}
    >
      <View style={twrnc`mb-6`}>
        <CustomText style={twrnc`text-2xl font-bold text-white mb-2`}>Body Metrics</CustomText>
        <CustomText style={twrnc`text-sm text-gray-400`}>Help us personalize your fitness journey</CustomText>
      </View>

      {/* Height Input */}
      <View style={twrnc`mb-5`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Height (cm)</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isHeightFocused && twrnc`border-2 border-indigo-500`,
            errors.height && twrnc`border-2 border-red-500`,
            !isHeightFocused && !errors.height && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="resize-outline" size={20} color={isHeightFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Enter your height"
            placeholderTextColor="#6b7280"
            value={height}
            onChangeText={(text) => {
              setHeight(text)
              if (errors.height) setErrors((prev) => ({ ...prev, height: "" }))
            }}
            onFocus={() => setIsHeightFocused(true)}
            onBlur={() => setIsHeightFocused(false)}
            keyboardType="numeric"
            returnKeyType="next"
            onSubmitEditing={() => weightInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>
        {errors.height && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.height}</CustomText>}
      </View>

      {/* Weight Input */}
      <View style={twrnc`mb-5`}>
        <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>Weight (kg)</CustomText>
        <View
          style={[
            twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
            isWeightFocused && twrnc`border-2 border-indigo-500`,
            errors.weight && twrnc`border-2 border-red-500`,
            !isWeightFocused && !errors.weight && twrnc`border border-gray-700`,
          ]}
        >
          <Ionicons name="fitness-outline" size={20} color={isWeightFocused ? "#6366f1" : "#6b7280"} style={twrnc`mr-3`} />
          <TextInput
            ref={weightInputRef}
            style={twrnc`flex-1 text-base text-white py-3.5`}
            placeholder="Enter your weight"
            placeholderTextColor="#6b7280"
            value={weight}
            onChangeText={(text) => {
              setWeight(text)
              if (errors.weight) setErrors((prev) => ({ ...prev, weight: "" }))
            }}
            onFocus={() => {
              setIsWeightFocused(true)
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)
            }}
            onBlur={() => setIsWeightFocused(false)}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleNextStep}
          />
        </View>
        {errors.weight && <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>{errors.weight}</CustomText>}
      </View>

      {/* BMI Display */}
      {bmi && (
        <View style={twrnc`bg-[#0f172a] rounded-xl p-4 border border-gray-700`}>
          <CustomText style={twrnc`text-sm text-gray-400 mb-2`}>Your BMI</CustomText>
          <View style={twrnc`flex-row items-center justify-between mb-3`}>
            <CustomText style={twrnc`text-3xl font-bold text-white`}>{bmi}</CustomText>
            <View style={[twrnc`px-3 py-1.5 rounded-full`, { backgroundColor: getBmiCategory(bmi).color + "20" }]}>
              <CustomText style={[twrnc`text-sm font-semibold`, { color: getBmiCategory(bmi).color }]}>
                {getBmiCategory(bmi).category}
              </CustomText>
            </View>
          </View>

          {/* BMI Bar */}
          <View style={twrnc`h-2 bg-gray-700 rounded-full overflow-hidden mb-2`}>
            <View style={twrnc`flex-row h-full`}>
              <View style={[twrnc`flex-1`, { backgroundColor: "#FFD166" }]} />
              <View style={[twrnc`flex-1`, { backgroundColor: "#06D6A0" }]} />
              <View style={[twrnc`flex-1`, { backgroundColor: "#FFC107" }]} />
              <View style={[twrnc`flex-1`, { backgroundColor: "#EF476F" }]} />
            </View>
          </View>

          {/* BMI Scale Labels */}
          <View style={twrnc`flex-row justify-between`}>
            <CustomText style={twrnc`text-xs text-gray-500`}>18.5</CustomText>
            <CustomText style={twrnc`text-xs text-gray-500`}>25</CustomText>
            <CustomText style={twrnc`text-xs text-gray-500`}>30</CustomText>
            <CustomText style={twrnc`text-xs text-gray-500`}>40</CustomText>
          </View>
        </View>
      )}
    </Animated.View>
  )

  const renderStep3 = () => (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={twrnc`mb-6`}>
        <CustomText style={twrnc`text-2xl font-bold text-white mb-2`}>Fitness Goals</CustomText>
        <CustomText style={twrnc`text-sm text-gray-400`}>Select your primary fitness goal</CustomText>
      </View>

      {/* Goals List */}
      {fitnessGoals.map((goal) => (
        <TouchableOpacity
          key={goal.id}
          onPress={() => setFitnessGoal(goal.id)}
          activeOpacity={0.8}
          style={[
            twrnc`bg-[#0f172a] rounded-xl p-4 mb-4 flex-row items-center border-2`,
            fitnessGoal === goal.id ? { borderColor: goal.color } : twrnc`border-gray-700`,
          ]}
        >
          <View style={[twrnc`w-12 h-12 rounded-full items-center justify-center mr-4`, { backgroundColor: goal.color + "20" }]}>
            <Ionicons name={goal.icon} size={24} color={goal.color} />
          </View>
          <View style={twrnc`flex-1`}>
            <CustomText style={twrnc`text-base font-bold text-white mb-1`}>{goal.label}</CustomText>
            <CustomText style={twrnc`text-xs text-gray-400`}>
              {goal.id === "weight_loss" && "Focus on burning calories and losing weight"}
              {goal.id === "muscle_gain" && "Build strength and increase muscle mass"}
              {goal.id === "endurance" && "Improve cardiovascular fitness and stamina"}
              {goal.id === "general_fitness" && "Overall health and wellness improvement"}
            </CustomText>
          </View>
          {fitnessGoal === goal.id && <Ionicons name="checkmark-circle" size={28} color={goal.color} />}
        </TouchableOpacity>
      ))}

      {/* Info Box */}
      <View style={twrnc`bg-indigo-900 bg-opacity-30 rounded-xl p-4 border border-indigo-700 mt-2`}>
        <View style={twrnc`flex-row items-center mb-2`}>
          <Ionicons name="information-circle" size={20} color="#818cf8" style={twrnc`mr-2`} />
          <CustomText style={twrnc`text-sm font-bold text-indigo-300`}>Personalized Experience</CustomText>
        </View>
        <CustomText style={twrnc`text-xs text-indigo-200`}>
          Your fitness goal helps us tailor workout recommendations, challenges, and progress tracking to your specific needs.
        </CustomText>
      </View>
    </Animated.View>
  )

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            twrnc`flex-grow px-6 py-8`,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 20 : 40 }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header */}
          <Animated.View
            style={[
              twrnc`mb-6`,
              { opacity: fadeAnim, transform: [{ translateY: headerSlideAnim }] },
            ]}
          >
            <View style={twrnc`flex-row items-center justify-between mb-4`}>
              <TouchableOpacity onPress={handlePrevStep} style={twrnc`p-2`}>
                <Ionicons name="arrow-back" size={24} color="white" />
              </TouchableOpacity>
              <CustomText style={twrnc`text-lg font-bold text-white`}>
                {currentStep === 1 ? "Account Details" : currentStep === 2 ? "Body Metrics" : "Fitness Goals"}
              </CustomText>
              <View style={twrnc`w-10`} />
            </View>

            {/* Step Indicator */}
            {renderStepIndicator()}
          </Animated.View>

          {/* Form Card */}
          <View style={twrnc`bg-[#1e293b] rounded-3xl p-6 shadow-2xl mb-6`}>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
          </View>

          {/* Buttons */}
          <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
            {currentStep < 3 ? (
              <TouchableOpacity
                onPress={handleNextStep}
                style={twrnc`bg-indigo-600 rounded-xl py-4 items-center shadow-xl`}
                activeOpacity={0.8}
              >
                <CustomText style={twrnc`text-white text-base font-bold`}>Next Step</CustomText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={validateAndSignUp}
                disabled={isLoading}
                style={[twrnc`bg-indigo-600 rounded-xl py-4 items-center shadow-xl flex-row justify-center`, isLoading && twrnc`opacity-70`]}
                activeOpacity={0.8}
              >
                {isLoading && <ActivityIndicator size="small" color="white" style={twrnc`mr-2`} />}
                <CustomText style={twrnc`text-white text-base font-bold`}>
                  {isLoading ? "Creating Account..." : "Create Account"}
                </CustomText>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Sign In Link */}
          {currentStep === 1 && (
            <View style={twrnc`flex-row items-center justify-center mt-6`}>
              <CustomText style={twrnc`text-gray-400 text-sm`}>Already have an account? </CustomText>
              <TouchableOpacity onPress={() => navigateToSignIn()} activeOpacity={0.7}>
                <CustomText style={twrnc`text-sm font-bold text-[#FFC107]`}>Sign In</CustomText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* Modal */}
      <CustomModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        type={modalType}
        onClose={handleModalClose}
      />
    </View>
  )
}

export default SignupScreen

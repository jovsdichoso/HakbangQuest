"use client"
import { useState, useEffect, useRef } from "react"
import {
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
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
  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [bmi, setBmi] = useState(null)
  const [fitnessGoal, setFitnessGoal] = useState("")

  // UI states
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isUsernameFocused, setIsUsernameFocused] = useState(false)
  const [isEmailFocused, setIsEmailFocused] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [isHeightFocused, setIsHeightFocused] = useState(false)
  const [isWeightFocused, setIsWeightFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [errors, setErrors] = useState({
    username: "",
    email: "",
    password: "",
    height: "",
    weight: "",
  })

  // Modal states
  const [modalVisible, setModalVisible] = useState(false)
  const [modalTitle, setModalTitle] = useState("")
  const [modalMessage, setModalMessage] = useState("")
  const [modalType, setModalType] = useState("success") // success, warning, error

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const headerSlideAnim = useRef(new Animated.Value(-50)).current
  const buttonScaleAnim = useRef(new Animated.Value(1)).current
  const inputShakeAnim = useRef(new Animated.Value(0)).current
  const stepTransitionAnim = useRef(new Animated.Value(0)).current

  // Fitness goals options
  const fitnessGoals = [
    { id: "weight_loss", label: "Weight Loss", icon: "line-chart", color: "#EF476F" },
    { id: "muscle_gain", label: "Muscle Gain", icon: "plus-circle", color: "#06D6A0" },
    { id: "endurance", label: "Endurance", icon: "heart", color: "#4361EE" },
    { id: "general_fitness", label: "General Fitness", icon: "star", color: "#FFC107" },
  ]

  // Lock navigation when modal is open
  useEffect(() => {
    if (modalVisible) {
      setIsNavigationLocked(true)
    } else {
      setIsNavigationLocked(false)
    }
  }, [modalVisible, setIsNavigationLocked])

  // Entrance animations
  useEffect(() => {
    animateScreenElements()
  }, [])

  // BMI calculation
  useEffect(() => {
    if (height && weight) {
      const heightInMeters = Number.parseFloat(height) / 100
      const weightInKg = Number.parseFloat(weight)
      if (heightInMeters > 0 && weightInKg > 0) {
        const calculatedBmi = weightInKg / (heightInMeters * heightInMeters)
        setBmi(calculatedBmi.toFixed(1))
      }
    }
  }, [height, weight])

  // Animate screen elements
  const animateScreenElements = () => {
    fadeAnim.setValue(0)
    slideAnim.setValue(50)
    headerSlideAnim.setValue(-50)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerSlideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }

  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const animateInputError = () => {
    Animated.sequence([
      Animated.timing(inputShakeAnim, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(inputShakeAnim, {
        toValue: -10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(inputShakeAnim, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(inputShakeAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const animateStepTransition = () => {
    Animated.sequence([
      Animated.timing(stepTransitionAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stepTransitionAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }

  // Validation functions
  const validateStep1 = () => {
    const newErrors = { username: "", email: "", password: "" }
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
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters"
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
    } else if (isNaN(Number.parseFloat(height)) || Number.parseFloat(height) <= 0) {
      newErrors.height = "Please enter a valid height"
      hasError = true
    }
    if (!weight.trim()) {
      newErrors.weight = "Weight is required"
      hasError = true
    } else if (isNaN(Number.parseFloat(weight)) || Number.parseFloat(weight) <= 0) {
      newErrors.weight = "Please enter a valid weight"
      hasError = true
    }
    setErrors({ ...errors, ...newErrors })
    return !hasError
  }

  const handleNextStep = () => {
    if (currentStep === 1 && validateStep1()) {
      animateStepTransition()
      setCurrentStep(2)
    } else if (currentStep === 2 && validateStep2()) {
      animateStepTransition()
      setCurrentStep(3)
    } else if (currentStep === 1 || currentStep === 2) {
      animateInputError()
    }
  }

  const handlePrevStep = () => {
    if (currentStep > 1) {
      animateStepTransition()
      setCurrentStep(currentStep - 1)
    } else {
      navigateToSignIn()
    }
  }

  // Sign up process
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
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Save user data
      await setDoc(doc(db, "users", user.uid), {
        username,
        email,
        height: Number.parseFloat(height),
        weight: Number.parseFloat(weight),
        bmi: Number.parseFloat(bmi),
        fitnessGoal,
        createdAt: new Date(),
        level: 1,
        xp: 0,
        totalActivities: 0,
        totalDistance: 0,
        totalDuration: 0,
        achievements: [],
        badges: [],
      })

      // Store email in AsyncStorage
      const storedEmails = await AsyncStorage.getItem("registeredEmails")
      const emails = storedEmails ? JSON.parse(storedEmails) : []
      if (!emails.includes(email)) {
        emails.push(email)
        await AsyncStorage.setItem("registeredEmails", JSON.stringify(emails))
      }

      setModalTitle("Account Created Successfully!")
      setModalMessage(
        "Your HakbangQuest account has been created. Please verify your email before logging in to start your fitness journey."
      )
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
        return "Password should be at least 6 characters."
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
    const bmiNum = Number.parseFloat(bmiValue)
    if (bmiNum < 18.5) return { category: "Underweight", color: "#FFD166" }
    if (bmiNum < 25) return { category: "Normal", color: "#06D6A0" }
    if (bmiNum < 30) return { category: "Overweight", color: "#FFC107" }
    return { category: "Obese", color: "#EF476F" }
  }

  const renderStepIndicator = () => (
    <View style={twrnc`flex-row justify-center mb-8`}>
      {[1, 2, 3].map((step) => (
        <View key={step} style={twrnc`flex-row items-center ${step !== 3 ? "mr-2" : ""}`}>
          <View
            style={twrnc`w-10 h-10 rounded-full items-center justify-center ${
              currentStep === step
                ? "bg-[#4361EE] border-2 border-[#4361EE]"
                : currentStep > step
                ? "bg-[#06D6A0] border-2 border-[#06D6A0]"
                : "bg-[#1E2538] border border-gray-600"
            }`}
          >
            {currentStep > step ? (
              <FontAwesome name="check" size={16} color="#FFFFFF" />
            ) : (
              <CustomText weight="semibold" style={twrnc`text-white ${isSmallDevice ? "text-sm" : "text-base"}`}>
                {step}
              </CustomText>
            )}
          </View>
          {step !== 3 && (
            <View style={twrnc`h-1 w-12 ${currentStep > step ? "bg-[#06D6A0]" : "bg-[#1E2538]"} rounded-full mx-2`} />
          )}
        </View>
      ))}
    </View>
  )

  // Render Step 1 - Account Details
  const renderStep1 = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={twrnc`mb-8`}>
        <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-3xl" : "text-4xl"} mb-2`}>
          Create Account
        </CustomText>
        <CustomText style={twrnc`text-[#8E8E93] ${isSmallDevice ? "text-sm" : "text-base"}`}>
          Let's create your HakbangQuest account
        </CustomText>
      </View>

      <Animated.View style={{ transform: [{ translateX: inputShakeAnim }] }}>
        {/* Username Input */}
        <View style={twrnc`mb-4`}>
          <CustomText weight="medium" style={twrnc`text-white mb-2 ${isSmallDevice ? "text-sm" : "text-base"}`}>
            Username
          </CustomText>
          <TextInput
            style={[
              twrnc`bg-[#1E2538] rounded-xl p-4 text-white ${
                isUsernameFocused ? "border-2 border-[#4361EE]" : "border border-gray-600"
              } ${errors.username ? "border-red-500" : ""}`,
              { fontFamily: "Poppins-Regular", fontSize: isSmallDevice ? 14 : 16 },
            ]}
            placeholder="Enter your username"
            placeholderTextColor="#8E8E93"
            value={username}
            onChangeText={(text) => {
              setUsername(text)
              if (errors.username) setErrors((prev) => ({ ...prev, username: "" }))
            }}
            onFocus={() => setIsUsernameFocused(true)}
            onBlur={() => setIsUsernameFocused(false)}
          />
          {errors.username ? (
            <View style={twrnc`flex-row items-center mt-2`}>
              <FontAwesome name="exclamation-circle" size={14} color="#EF4444" />
              <CustomText style={twrnc`text-red-500 ml-2 ${isSmallDevice ? "text-xs" : "text-sm"}`}>
                {errors.username}
              </CustomText>
            </View>
          ) : null}
        </View>

        {/* Email Input */}
        <View style={twrnc`mb-4`}>
          <CustomText weight="medium" style={twrnc`text-white mb-2 ${isSmallDevice ? "text-sm" : "text-base"}`}>
            Email Address
          </CustomText>
          <TextInput
            style={[
              twrnc`bg-[#1E2538] rounded-xl p-4 text-white ${
                isEmailFocused ? "border-2 border-[#4361EE]" : "border border-gray-600"
              } ${errors.email ? "border-red-500" : ""}`,
              { fontFamily: "Poppins-Regular", fontSize: isSmallDevice ? 14 : 16 },
            ]}
            placeholder="Enter your email"
            placeholderTextColor="#8E8E93"
            value={email}
            onChangeText={(text) => {
              setEmail(text)
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }))
            }}
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => setIsEmailFocused(false)}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {errors.email ? (
            <View style={twrnc`flex-row items-center mt-2`}>
              <FontAwesome name="exclamation-circle" size={14} color="#EF4444" />
              <CustomText style={twrnc`text-red-500 ml-2 ${isSmallDevice ? "text-xs" : "text-sm"}`}>
                {errors.email}
              </CustomText>
            </View>
          ) : null}
        </View>

        {/* Password Input */}
        <View style={twrnc`mb-6`}>
          <CustomText weight="medium" style={twrnc`text-white mb-2 ${isSmallDevice ? "text-sm" : "text-base"}`}>
            Password
          </CustomText>
          <View style={twrnc`relative`}>
            <TextInput
              style={[
                twrnc`bg-[#1E2538] rounded-xl p-4 pr-12 text-white ${
                  isPasswordFocused ? "border-2 border-[#4361EE]" : "border border-gray-600"
                } ${errors.password ? "border-red-500" : ""}`,
                { fontFamily: "Poppins-Regular", fontSize: isSmallDevice ? 14 : 16 },
              ]}
              placeholder="Enter your password"
              placeholderTextColor="#8E8E93"
              value={password}
              onChangeText={(text) => {
                setPassword(text)
                if (errors.password) setErrors((prev) => ({ ...prev, password: "" }))
              }}
              secureTextEntry={!isPasswordVisible}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
            />
            <TouchableOpacity
              style={twrnc`absolute right-4 top-4`}
              onPress={() => setIsPasswordVisible(!isPasswordVisible)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name={isPasswordVisible ? "eye" : "eye-slash"} size={16} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          {errors.password ? (
            <View style={twrnc`flex-row items-center mt-2`}>
              <FontAwesome name="exclamation-circle" size={14} color="#EF4444" />
              <CustomText style={twrnc`text-red-500 ml-2 ${isSmallDevice ? "text-xs" : "text-sm"}`}>
                {errors.password}
              </CustomText>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Animated.View>
  )

  // Render Step 2 - Body Metrics
  const renderStep2 = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={twrnc`mb-8`}>
        <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-3xl" : "text-4xl"} mb-2`}>
          Body Metrics
        </CustomText>
        <CustomText style={twrnc`text-[#8E8E93] ${isSmallDevice ? "text-sm" : "text-base"}`}>
          Help us personalize your fitness journey
        </CustomText>
      </View>

      <Animated.View style={{ transform: [{ translateX: inputShakeAnim }] }}>
        {/* Height Input */}
        <View style={twrnc`flex-row mb-6`}>
          <View style={twrnc`flex-1 mr-2`}>
            <CustomText weight="medium" style={twrnc`text-white mb-2 ${isSmallDevice ? "text-sm" : "text-base"}`}>
              Height (cm)
            </CustomText>
            <TextInput
              style={[
                twrnc`bg-[#1E2538] rounded-xl p-4 text-white ${
                  isHeightFocused ? "border-2 border-[#4361EE]" : "border border-gray-600"
                } ${errors.height ? "border-red-500" : ""}`,
                { fontFamily: "Poppins-Regular", fontSize: isSmallDevice ? 14 : 16 },
              ]}
              placeholder="175"
              placeholderTextColor="#8E8E93"
              value={height}
              onChangeText={(text) => {
                setHeight(text)
                if (errors.height) setErrors((prev) => ({ ...prev, height: "" }))
              }}
              onFocus={() => setIsHeightFocused(true)}
              onBlur={() => setIsHeightFocused(false)}
              keyboardType="numeric"
            />
            {errors.height ? (
              <View style={twrnc`flex-row items-center mt-2`}>
                <FontAwesome name="exclamation-circle" size={12} color="#EF4444" />
                <CustomText style={twrnc`text-red-500 ml-1 text-xs`}>{errors.height}</CustomText>
              </View>
            ) : null}
          </View>

          {/* Weight Input */}
          <View style={twrnc`flex-1 ml-2`}>
            <CustomText weight="medium" style={twrnc`text-white mb-2 ${isSmallDevice ? "text-sm" : "text-base"}`}>
              Weight (kg)
            </CustomText>
            <TextInput
              style={[
                twrnc`bg-[#1E2538] rounded-xl p-4 text-white ${
                  isWeightFocused ? "border-2 border-[#4361EE]" : "border border-gray-600"
                } ${errors.weight ? "border-red-500" : ""}`,
                { fontFamily: "Poppins-Regular", fontSize: isSmallDevice ? 14 : 16 },
              ]}
              placeholder="70"
              placeholderTextColor="#8E8E93"
              value={weight}
              onChangeText={(text) => {
                setWeight(text)
                if (errors.weight) setErrors((prev) => ({ ...prev, weight: "" }))
              }}
              onFocus={() => setIsWeightFocused(true)}
              onBlur={() => setIsWeightFocused(false)}
              keyboardType="numeric"
            />
            {errors.weight ? (
              <View style={twrnc`flex-row items-center mt-2`}>
                <FontAwesome name="exclamation-circle" size={12} color="#EF4444" />
                <CustomText style={twrnc`text-red-500 ml-1 text-xs`}>{errors.weight}</CustomText>
              </View>
            ) : null}
          </View>
        </View>

        {/* BMI Display */}
        {bmi && (
          <View style={twrnc`bg-[#1E2538] p-4 rounded-xl border border-gray-600 mb-6`}>
            <View style={twrnc`flex-row justify-between items-center mb-3`}>
              <CustomText weight="medium" style={twrnc`text-white ${isSmallDevice ? "text-sm" : "text-base"}`}>
                Your BMI
              </CustomText>
              <View style={twrnc`flex-row items-center`}>
                <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-xl" : "text-2xl"} mr-2`}>
                  {bmi}
                </CustomText>
                <View style={[twrnc`px-3 py-1 rounded-full`, { backgroundColor: getBmiCategory(bmi).color }]}>
                  <CustomText weight="medium" style={twrnc`text-white text-xs`}>
                    {getBmiCategory(bmi).category}
                  </CustomText>
                </View>
              </View>
            </View>
            {/* BMI Bar */}
            <View style={twrnc`h-2 bg-[#2A2E3A] rounded-full overflow-hidden mb-2`}>
              <View
                style={[
                  twrnc`h-2 rounded-full`,
                  {
                    width: `${Math.min((Number.parseFloat(bmi) / 40) * 100, 100)}%`,
                    backgroundColor: getBmiCategory(bmi).color,
                  },
                ]}
              />
            </View>
            {/* BMI Scale Labels */}
            <View style={twrnc`flex-row justify-between`}>
              <CustomText style={twrnc`text-[#8E8E93] text-xs`}>18.5</CustomText>
              <CustomText style={twrnc`text-[#8E8E93] text-xs`}>25</CustomText>
              <CustomText style={twrnc`text-[#8E8E93] text-xs`}>30</CustomText>
              <CustomText style={twrnc`text-[#8E8E93] text-xs`}>40</CustomText>
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  )

  // Render Step 3 - Fitness Goals
  const renderStep3 = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={twrnc`mb-8`}>
        <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-3xl" : "text-4xl"} mb-2`}>
          Fitness Goals
        </CustomText>
        <CustomText style={twrnc`text-[#8E8E93] ${isSmallDevice ? "text-sm" : "text-base"}`}>
          Select your primary fitness goal
        </CustomText>
      </View>

      {/* Goals List */}
      <View style={twrnc`mb-6`}>
        {fitnessGoals.map((goal) => (
          <TouchableOpacity
            key={goal.id}
            style={twrnc`flex-row items-center p-4 rounded-xl mb-3 border ${
              fitnessGoal === goal.id ? "bg-[#4361EE] border-[#4361EE]" : "bg-[#1E2538] border-gray-600"
            }`}
            onPress={() => setFitnessGoal(goal.id)}
            activeOpacity={0.8}
          >
            <View
              style={[
                twrnc`w-12 h-12 rounded-full items-center justify-center mr-4`,
                { backgroundColor: fitnessGoal === goal.id ? "rgba(255,255,255,0.2)" : goal.color },
              ]}
            >
              <FontAwesome name={goal.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={twrnc`flex-1`}>
              <CustomText weight="semibold" style={twrnc`text-white ${isSmallDevice ? "text-base" : "text-lg"} mb-1`}>
                {goal.label}
              </CustomText>
              <CustomText style={twrnc`text-gray-400 ${isSmallDevice ? "text-xs" : "text-sm"}`}>
                {goal.id === "weight_loss" && "Focus on burning calories and losing weight"}
                {goal.id === "muscle_gain" && "Build strength and increase muscle mass"}
                {goal.id === "endurance" && "Improve cardiovascular fitness and stamina"}
                {goal.id === "general_fitness" && "Overall health and wellness improvement"}
              </CustomText>
            </View>
            {/* Selection Indicator */}
            <View
              style={twrnc`w-6 h-6 rounded-full border-2 ${
                fitnessGoal === goal.id ? "border-white" : "border-gray-400"
              } items-center justify-center`}
            >
              {fitnessGoal === goal.id && <View style={twrnc`w-3 h-3 rounded-full bg-white`} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Info Box */}
      <View style={twrnc`bg-[#1E2538] p-4 rounded-xl border border-gray-600 mb-6`}>
        <View style={twrnc`flex-row items-start`}>
          <View style={twrnc`bg-[#4361EE] p-2 rounded-full mr-3`}>
            <FontAwesome name="info" size={14} color="#FFFFFF" />
          </View>
          <View style={twrnc`flex-1`}>
            <CustomText weight="medium" style={twrnc`text-white mb-1 ${isSmallDevice ? "text-sm" : "text-base"}`}>
              Personalized Experience
            </CustomText>
            <CustomText style={twrnc`text-gray-400 ${isSmallDevice ? "text-xs" : "text-sm"}`}>
              Your fitness goal helps us tailor workout recommendations, challenges, and progress tracking to your
              specific needs.
            </CustomText>
          </View>
        </View>
      </View>
    </Animated.View>
  )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "android" ? "padding" : "height"}
      style={twrnc`flex-1 bg-[#121826] p-5`}
    >
      <ScrollView contentContainerStyle={twrnc`flex-grow`} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <Animated.View
          style={[
            twrnc`flex-row items-center mb-6`,
            { transform: [{ translateY: headerSlideAnim }], opacity: fadeAnim },
          ]}
        >
          <TouchableOpacity
            style={twrnc`p-2`}
            onPress={handlePrevStep}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={twrnc`flex-1 items-center`}>
            <CustomText weight="medium" style={twrnc`text-white ${isSmallDevice ? "text-lg" : "text-xl"}`}>
              {currentStep === 1 ? "Account Details" : currentStep === 2 ? "Body Metrics" : "Fitness Goals"}
            </CustomText>
          </View>
          <View style={twrnc`w-10`} />
        </Animated.View>

        {/* Step Indicator */}
        <Animated.View style={[{ opacity: fadeAnim }]}>{renderStepIndicator()}</Animated.View>

        {/* Step Content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}

        {/* Buttons */}
        <Animated.View style={[twrnc`mt-8`, { opacity: fadeAnim }]}>
          {currentStep < 3 ? (
            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                style={twrnc`bg-[#4361EE] py-4 rounded-xl items-center flex-row justify-center`}
                onPress={handleNextStep}
                activeOpacity={0.8}
              >
                <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-base" : "text-lg"} mr-2`}>
                  Next Step
                </CustomText>
                <FontAwesome name="arrow-right" size={16} color="white" />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                style={twrnc`bg-[#4361EE] py-4 rounded-xl items-center flex-row justify-center ${
                  isLoading ? "opacity-70" : ""
                }`}
                onPress={validateAndSignUp}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" style={twrnc`mr-2`} />
                ) : (
                  <FontAwesome name="user-plus" size={18} color="white" style={twrnc`mr-2`} />
                )}
                <CustomText weight="bold" style={twrnc`text-white ${isSmallDevice ? "text-base" : "text-lg"}`}>
                  {isLoading ? "Creating Account..." : "Create Account"}
                </CustomText>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Sign In Link */}
          {currentStep === 1 && (
            <View style={twrnc`bg-[#1E2538] p-4 rounded-xl border border-gray-700 mt-4`}>
              <View style={twrnc`flex-row justify-center items-center`}>
                <CustomText style={twrnc`text-[#8E8E93] ${isSmallDevice ? "text-sm" : "text-base"}`}>
                  Already have an account?
                </CustomText>
                <TouchableOpacity onPress={() => navigateToSignIn()} style={twrnc`ml-1`} activeOpacity={0.7}>
                  <CustomText weight="bold" style={twrnc`text-[#FFC107] ${isSmallDevice ? "text-sm" : "text-base"}`}>
                    Sign In
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Modal */}
        <CustomModal
          visible={modalVisible}
          title={modalTitle}
          message={modalMessage}
          onClose={handleModalClose}
          icon={
            modalType === "success"
              ? "check-circle"
              : modalType === "warning"
              ? "exclamation-triangle"
              : "exclamation-circle"
          }
          type={modalType}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default SignupScreen
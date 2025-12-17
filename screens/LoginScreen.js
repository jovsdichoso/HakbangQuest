import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import twrnc from "twrnc";
import CustomText from "../components/CustomText";
import CustomModal from "../components/CustomModal";
import { auth, db } from "../firebaseConfig";
import NotificationService from "../services/NotificationService";
import { signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { FontAwesome, Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

const LoginScreen = ({ navigateToLanding, navigateToSignUp, navigateToDashboard, prefilledEmail, setUserData }) => {
  const [email, setEmail] = useState(prefilledEmail || "");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("error");
  const [userForVerification, setUserForVerification] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollViewRef = useRef(null);
  const passwordInputRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const headerSlideAnim = useRef(new Animated.Value(-50)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const inputShakeAnim = useRef(new Animated.Value(0)).current;
  const patternAnim = useRef(new Animated.Value(0)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    setEmail(prefilledEmail || "");
    animateScreenElements();

    // Keyboard listeners
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    // Animate decorative pattern continuously
    Animated.loop(
      Animated.timing(patternAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [prefilledEmail]);

  const animateScreenElements = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    headerSlideAnim.setValue(-50);
    logoScaleAnim.setValue(0.8);

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
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

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
    ]).start();
  };

  const animateInputError = () => {
    Animated.sequence([
      Animated.timing(inputShakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(inputShakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handleEmailSignIn = async () => {
    let hasError = false;
    const newErrors = { email: "", password: "" };

    if (!email) {
      newErrors.email = "Email is required";
      hasError = true;
    }

    if (!password) {
      newErrors.password = "Password is required";
      hasError = true;
    }

    setErrors(newErrors);
    if (hasError) {
      animateInputError();
      return;
    }

    animateButtonPress();
    setIsLoading(true);
    Keyboard.dismiss();

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setUserForVerification(user);
        setModalTitle("Email Not Verified");
        setModalMessage("Please verify your email to access all features.");
        setModalType("warning");
        setModalVisible(true);
        return;
      }

      const defaultUserData = {
        username: user.displayName || email.split("@")[0] || "User",
        email: user.email || "user@example.com",
        avatar: "https://randomuser.me/api/portraits/men/1.jpg",
        uid: user.uid,
        privacySettings: { showProfile: true, showActivities: true, showStats: true },
        avgDailySteps: 5000,
        avgDailyDistance: 2.5,
        avgActiveDuration: 45,
        avgDailyReps: 20,
        level: 1,
        totalXP: 0,
      };

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      let userData = { ...defaultUserData };

      if (userDoc.exists()) {
        const firestoreData = userDoc.data();
        userData = {
          ...userData,
          username: firestoreData.username || userData.username,
          avatar: firestoreData.avatar || userData.avatar,
          privacySettings: firestoreData.privacySettings || userData.privacySettings,
          avgDailySteps: firestoreData.avgDailySteps || userData.avgDailySteps,
          avgDailyDistance: firestoreData.avgDailyDistance || userData.avgDailyDistance,
          avgActiveDuration: firestoreData.avgActiveDuration || userData.avgActiveDuration,
          avgDailyReps: firestoreData.avgDailyReps || userData.avgDailyReps,
          level: firestoreData.level || userData.level,
          totalXP: firestoreData.totalXP || userData.totalXP,
        };
      } else {
        await setDoc(userDocRef, userData);
        console.log("Created new user document for UID:", user.uid);
      }

      await AsyncStorage.multiSet([
        ["userSession", JSON.stringify({
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          lastLogin: new Date().toISOString(),
        })],
        ["lastActiveScreen", "dashboard"],
      ]);

      setUserData(userData);
      await NotificationService.sendWelcomeBackNotification(userData.username);
      navigateToDashboard();
    } catch (error) {
      console.error("Login error:", error.message);
      setModalTitle("Login Failed");
      setModalMessage(getErrorMessage(error.code));
      setModalType("error");
      setModalVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/user-not-found":
        return "No account found with this email address.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later.";
      default:
        return "Login failed. Please check your credentials and try again.";
    }
  };

  const handleResendVerification = async () => {
    if (!userForVerification) {
      setModalTitle("Error");
      setModalMessage("No user available to resend verification email.");
      setModalType("error");
      setModalVisible(true);
      return;
    }

    setIsLoading(true);
    try {
      await sendEmailVerification(userForVerification);
      setModalTitle("Verification Email Sent");
      setModalMessage("A new verification email has been sent to your email address.");
      setModalType("success");
      setModalVisible(true);
    } catch (error) {
      console.error("Error resending verification email:", error.message);
      setModalTitle("Error");
      setModalMessage(error.message);
      setModalType("error");
      setModalVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setModalTitle("Email Required");
      setModalMessage("Please enter your email address to reset your password.");
      setModalType("warning");
      setModalVisible(true);
      return;
    }

    setIsLoading(true);
    Keyboard.dismiss();

    try {
      await sendPasswordResetEmail(auth, email);
      setModalTitle("Password Reset Email Sent");
      setModalMessage("A password reset email has been sent. Check your inbox and follow the instructions.");
      setModalType("success");
      setModalVisible(true);
    } catch (error) {
      console.error("Error sending password reset email:", error.message);
      setModalTitle("Error");
      setModalMessage(getErrorMessage(error.code));
      setModalType("error");
      setModalVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = async () => {
    setModalVisible(false);
  };

  const patternRotation = patternAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
          {/* Header Section with Decorative Pattern */}
          <Animated.View
            style={[
              twrnc`items-center mb-10 mt-8`,
              {
                opacity: fadeAnim,
                transform: [{ translateY: headerSlideAnim }],
              },
            ]}
          >
            <View
              style={[
                twrnc`rounded-3xl p-8 overflow-hidden relative`,
                { backgroundColor: '#1e293b', width: '100%' }
              ]}
            >
              {/* Decorative Background Pattern */}
              <Animated.View
                style={[
                  twrnc`absolute top-0 right-0 w-40 h-40`,
                  {
                    opacity: 0.08,
                    transform: [{ rotate: patternRotation }]
                  }
                ]}
              >
                <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                  {[...Array(25)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`w-1/5 h-1/5 border border-indigo-400`,
                        { transform: [{ rotate: '45deg' }] }
                      ]}
                    />
                  ))}
                </View>
              </Animated.View>

              {/* Additional pattern on bottom left */}
              <Animated.View
                style={[
                  twrnc`absolute bottom-0 left-0 w-32 h-32`,
                  {
                    opacity: 0.06,
                    transform: [{ rotate: patternRotation }]
                  }
                ]}
              >
                <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                  {[...Array(16)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`w-1/4 h-1/4 border border-indigo-400`,
                        { transform: [{ rotate: '45deg' }] }
                      ]}
                    />
                  ))}
                </View>
              </Animated.View>

              {/* Logo and Branding */}
              <View style={twrnc`items-center z-10 relative`}>
                <Animated.View
                  style={[
                    twrnc`w-24 h-24 rounded-3xl items-center justify-center mb-4 shadow-xl overflow-hidden bg-white`,
                    { transform: [{ scale: logoScaleAnim }] }
                  ]}
                >
                  <Image
                    source={require('../assets/image/icon.png')}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </Animated.View>

                {/* App Name with Gradient Colors */}
                <View style={twrnc`flex-row items-center mb-5`}>
                  <View style={twrnc`w-1.5 h-7 bg-[#FFC107] rounded-full mr-2.5`} />
                  <CustomText style={[twrnc`text-2xl font-bold tracking-wide`, { color: '#FFC107' }]}>
                    Hakbang<CustomText style={[twrnc`text-2xl font-bold`, { color: '#4361EE' }]}>Quest</CustomText>
                  </CustomText>
                </View>

                {/* Welcome Message */}
                <View style={twrnc`items-center`}>
                  <CustomText style={twrnc`text-3xl font-bold text-white mb-2`}>
                    Welcome Back
                  </CustomText>
                  <CustomText style={twrnc`text-sm text-gray-400 text-center`}>
                    Sign in to continue your fitness journey
                  </CustomText>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Form Section */}
          <Animated.View
            style={[
              twrnc`bg-[#1e293b] rounded-3xl p-6 shadow-2xl`,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { translateX: inputShakeAnim }],
              },
            ]}
          >
            {/* Email Input */}
            <View style={twrnc`mb-5`}>
              <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>
                Email Address
              </CustomText>
              <View
                style={[
                  twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
                  isEmailFocused && twrnc`border-2 border-indigo-500`,
                  errors.email && twrnc`border-2 border-red-500`,
                  !isEmailFocused && !errors.email && twrnc`border border-gray-700`,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={isEmailFocused ? "#6366f1" : "#6b7280"}
                  style={twrnc`mr-3`}
                />
                <TextInput
                  style={twrnc`flex-1 text-base text-white py-3.5`}
                  placeholder="Enter your email"
                  placeholderTextColor="#6b7280"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
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
              {errors.email && (
                <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>
                  {errors.email}
                </CustomText>
              )}
            </View>

            {/* Password Input */}
            <View style={twrnc`mb-4`}>
              <CustomText style={twrnc`text-sm font-semibold text-gray-300 mb-2.5`}>
                Password
              </CustomText>
              <View
                style={[
                  twrnc`flex-row items-center bg-[#0f172a] rounded-xl px-4`,
                  isPasswordFocused && twrnc`border-2 border-indigo-500`,
                  errors.password && twrnc`border-2 border-red-500`,
                  !isPasswordFocused && !errors.password && twrnc`border border-gray-700`,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={isPasswordFocused ? "#6366f1" : "#6b7280"}
                  style={twrnc`mr-3`}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={twrnc`flex-1 text-base text-white py-3.5`}
                  placeholder="Enter your password"
                  placeholderTextColor="#6b7280"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  secureTextEntry={!isPasswordVisible}
                  onFocus={() => {
                    setIsPasswordFocused(true);
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                  onBlur={() => setIsPasswordFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleEmailSignIn}
                />
                <TouchableOpacity
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  style={twrnc`p-2`}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color="#9ca3af"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <CustomText style={twrnc`text-red-400 text-xs mt-1.5 ml-1`}>
                  {errors.password}
                </CustomText>
              )}
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity onPress={handleForgotPassword} style={twrnc`mb-6 self-end`}>
              <CustomText style={twrnc`text-indigo-400 text-sm font-semibold`}>
                Forgot Password?
              </CustomText>
            </TouchableOpacity>

            {/* Sign In Button */}
            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                onPress={handleEmailSignIn}
                disabled={isLoading}
                style={[
                  twrnc`bg-indigo-600 rounded-xl py-4 items-center shadow-xl`,
                  isLoading && twrnc`opacity-70`,
                ]}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <CustomText style={twrnc`text-white text-base font-bold`}>
                    Sign In
                  </CustomText>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          {/* Sign Up Link */}
          <View style={twrnc`flex-row items-center justify-center mt-8`}>
            <CustomText style={twrnc`text-gray-400 text-sm`}>
              Don't have an account?{" "}
            </CustomText>
            <TouchableOpacity onPress={navigateToSignUp}>
              <CustomText style={twrnc`text-sm font-bold text-[#FFC107]`}>
                Sign Up
              </CustomText>

            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* Modal */}
      <CustomModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        type={modalType}
        onClose={handleModalClose}
        onResendVerification={modalType === "warning" ? handleResendVerification : undefined}
      />
    </View>
  );
};

export default LoginScreen;

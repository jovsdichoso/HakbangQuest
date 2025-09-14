"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  BackHandler,
  ToastAndroid,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import twrnc from "twrnc";
import { FontAwesome } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import LandingScreen from "./screens/LandingScreen";
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import DashboardScreen from "./screens/DashboardScreen";
import ActivityScreen from "./screens/ActivityScreen";
import ProfileScreen from "./screens/ProfileScreen";
import CommunityScreen from "./screens/CommunityScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import MapScreen from "./screens/MapScreen";
import CustomText from "./components/CustomText";
import CustomModal from "./components/CustomModal";
import NotificationDropdown from "./components/NotificationDropdown";
import NotificationService from "./services/NotificationService";
import RunningIcon from "./components/icons/running.png";
import FootprintsIcon from "./components/icons/footprints.png";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

SplashScreen.preventAutoHideAsync();

// Responsive dimensions
const { width, height } = Dimensions.get("window");
const isSmallDevice = width < 375;
const isMediumDevice = width >= 375 && width < 414;
const isLargeDevice = width >= 414;

// Responsive font sizes
const responsiveFontSizes = {
  xs: isSmallDevice ? 10 : isMediumDevice ? 11 : 12,
  sm: isSmallDevice ? 12 : isMediumDevice ? 13 : 14,
  base: isSmallDevice ? 14 : isMediumDevice ? 15 : 16,
  lg: isSmallDevice ? 16 : isMediumDevice ? 18 : 20,
  xl: isSmallDevice ? 18 : isMediumDevice ? 20 : 22,
  "2xl": isSmallDevice ? 20 : isMediumDevice ? 22 : 24,
};

// Responsive padding/margin
const responsivePadding = {
  base: isSmallDevice ? 3 : isMediumDevice ? 4 : 5,
  lg: isSmallDevice ? 4 : isMediumDevice ? 5 : 6,
};

// Helper function to safely parse JSON
const safeParseJSON = (str, defaultValue = {}) => {
  try {
    return str ? JSON.parse(str) : defaultValue;
  } catch (error) {
    console.error("JSON parse error:", error.message);
    return defaultValue;
  }
};

const formatDate = () => {
  const date = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
  ];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const requestLocationPermissions = async (setModalTitle, setModalMessage, setModalVisible) => {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") return true;
    if (!canAskAgain) {
      setModalTitle("Permission Required");
      setModalMessage("Location permissions are required. Please enable them in app settings.");
      setModalVisible(true);
      return false;
    }
    setModalTitle("Permission Required");
    setModalMessage("This app needs location permissions to work properly.");
    setModalVisible(true);
    return false;
  } catch (error) {
    console.error("Error requesting location permissions:", error);
    setModalTitle("Error");
    setModalMessage("Failed to request location permissions.");
    setModalVisible(true);
    return false;
  }
};

const checkLocationPermissions = async () => {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    return granted;
  } catch (error) {
    console.error("Error checking location permissions:", error);
    return false;
  }
};

// Initialize user data from Firestore using UID
const initializeUserData = async (user, setUserData) => {
  console.log("initializeUserData called with user:", user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null);
  try {
    const defaultUserData = {
      username: "User",
      email: "user@example.com",
      avatar: "https://randomuser.me/api/portraits/men/1.jpg",
      uid: null,
      privacySettings: {
        showProfile: true,
        showActivities: true,
        showStats: true,
      },
      avgDailySteps: 5000,
      avgDailyDistance: 2.5,
      avgActiveDuration: 45,
      avgDailyReps: 20,
      level: 1,
      totalXP: 0,
    };

    let userData = { ...defaultUserData };
    let isValidSession = false;

    // Check for cached session
    const storedSession = await AsyncStorage.getItem("userSession");
    const sessionData = safeParseJSON(storedSession, null);
    console.log("Cached session data:", sessionData);

    if (user && user.emailVerified) {
      // Active Firebase user session
      isValidSession = true;
      userData = await fetchUserDataFromFirestore(user.uid, defaultUserData);
      await AsyncStorage.setItem("userSession", JSON.stringify({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        lastLogin: new Date().toISOString(),
      }));
      console.log("Updated AsyncStorage with userSession:", { uid: user.uid, email: user.email, emailVerified: user.emailVerified });
      setUserData(userData);
    } else if (sessionData?.uid && sessionData.emailVerified) {
      // No active Firebase user, but valid cached session
      try {
        // Note: This assumes a mechanism to refresh or validate session; adjust as needed
        // Since signInWithCredential(null) is not valid, we'll rely on cached data
        isValidSession = true;
        userData = await fetchUserDataFromFirestore(sessionData.uid, defaultUserData);
        setUserData(userData);
      } catch (error) {
        console.error("Error validating cached session:", error.message);
        await AsyncStorage.removeItem("userSession");
        userData = { ...defaultUserData };
        setUserData(userData);
      }
    } else {
      // No valid session
      await AsyncStorage.removeItem("userSession");
      userData = { ...defaultUserData };
      setUserData(userData);
    }

    return { userData, isValidSession };
  } catch (error) {
    console.error("Error in initializeUserData:", error.message);
    await AsyncStorage.removeItem("userSession");
    setUserData({ ...defaultUserData });
    return { userData: { ...defaultUserData }, isValidSession: false };
  }
};

// Fetch user data from Firestore
const fetchUserDataFromFirestore = async (uid, defaultUserData) => {
  try {
    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const firestoreData = userDoc.data();
      return {
        ...defaultUserData,
        username: firestoreData.username || defaultUserData.username,
        email: firestoreData.email || defaultUserData.email,
        avatar: firestoreData.avatar || defaultUserData.avatar,
        uid: uid,
        privacySettings: firestoreData.privacySettings || defaultUserData.privacySettings,
        avgDailySteps: firestoreData.avgDailySteps || defaultUserData.avgDailySteps,
        avgDailyDistance: firestoreData.avgDailyDistance || defaultUserData.avgDailyDistance,
        avgActiveDuration: firestoreData.avgActiveDuration || defaultUserData.avgActiveDuration,
        avgDailyReps: firestoreData.avgDailyReps || defaultUserData.avgDailyReps,
        level: firestoreData.level || defaultUserData.level,
        totalXP: firestoreData.totalXP || defaultUserData.totalXP,
      };
    } else {
      // Optionally create a new user document
      const newUserData = { ...defaultUserData, uid };
      await setDoc(userDocRef, newUserData);
      console.log("Created new user document for UID:", uid);
      return newUserData;
    }
  } catch (error) {
    console.error("Error fetching user data from Firestore:", error.message);
    return { ...defaultUserData };
  }
};

// Animated Screen Wrapper Component
const AnimatedScreenWrapper = ({ children, isActive, animationType = "fade" }) => {
  const fadeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0.95)).current;

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, fadeAnim, scaleAnim]);

  if (!isActive) return null;

  return (
    <Animated.View
      style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
    >
      <SafeAreaView style={twrnc`flex-1 pt--6 bg-[#121826]`}>
        {children}
      </SafeAreaView>
    </Animated.View>
  );
};

// Enhanced Map Button Component
const EnhancedMapButton = ({ onPress, isActive }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );

    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    glowAnimation.start();

    return () => {
      pulseAnimation.stop();
      glowAnimation.stop();
    };
  }, [scaleAnim, glowAnim]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start(() => onPress());
  }, [onPress, scaleAnim]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={twrnc`items-center flex-1 -mt-8`}
    >
      <Animated.View
        style={[
          twrnc`absolute w-20 h-20 rounded-full`,
          {
            backgroundColor: "#FFC107",
            opacity: glowAnim.interpolate({
              inputRange: [0, 0.3],
              outputRange: [0.15, 0.35],
            }),
            transform: [
              {
                scale: glowAnim.interpolate({
                  inputRange: [0, 0.3],
                  outputRange: [1, 1.2],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          twrnc`bg-gradient-to-r from-[#FFC107] to-[#FFD700] w-18 h-18 rounded-full items-center justify-center shadow-2xl`,
          {
            transform: [{ scale: scaleAnim }],
            elevation: 8,
            shadowColor: "#FFC107",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.6,
            shadowRadius: 8,
            padding: responsivePadding.lg,
          },
        ]}
      >
        <View style={twrnc`absolute top-1 left-1 w-4 h-4 bg-white/30 rounded-full`} />
        <Image
          source={FootprintsIcon}
          style={{
            width: 36,
            height: 36,
            resizeMode: "contain",
            tintColor: "#FFFFFF",
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Animated Navigation Tab Component
const AnimatedNavTab = ({ icon, label, isActive, onPress, iconSource = null }) => {
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0.9)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.7)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: isActive ? 1 : 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.7,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: isActive ? 1 : 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start(() => onPress());
  }, [isActive, onPress, scaleAnim]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={twrnc`items-center flex-1 p-[${responsivePadding.base}px]`}
    >
      <Animated.View
        style={[
          twrnc`${isActive ? "bg-[#FFC107]/20" : ""} rounded-xl p-[${responsivePadding.lg}px]`,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {iconSource ? (
          <Image
            source={iconSource}
            style={{
              width: responsiveFontSizes.xl,
              height: responsiveFontSizes.xl,
              resizeMode: "contain",
              tintColor: isActive ? "#FFC107" : "#FFFFFF",
            }}
          />
        ) : (
          <FontAwesome
            name={icon}
            size={responsiveFontSizes.xl}
            color={isActive ? "#FFC107" : "#FFFFFF"}
          />
        )}
      </Animated.View>
      <CustomText
        style={twrnc`text-[${responsiveFontSizes.xs}px] mt-1 ${isActive ? "text-[#FFC107]" : "text-gray-400"}`}
      >
        {label || icon}
      </CustomText>
    </TouchableOpacity>
  );
};

export default function App() {
  const [activeScreen, setActiveScreen] = useState("landing");
  const [previousScreen, setPreviousScreen] = useState("");
  const [userData, setUserData] = useState({
    username: "User",
    email: "user@example.com",
    avatar: "https://randomuser.me/api/portraits/men/1.jpg",
    uid: null,
    privacySettings: {
      showProfile: true,
      showActivities: true,
      showStats: true,
    },
    avgDailySteps: 5000,
    avgDailyDistance: 2.5,
    avgActiveDuration: 45,
    avgDailyReps: 20,
    level: 1,
    totalXP: 0,
  });
  const [activityParams, setActivityParams] = useState({});
  const [locationGranted, setLocationGranted] = useState(false);
  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("./assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("./assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("./assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-Bold": require("./assets/fonts/Poppins-Bold.ttf"),
  });
  const [isNavigationLocked, setIsNavigationLocked] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [verificationModalShown, setVerificationModalShown] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationDropdownVisible, setNotificationDropdownVisible] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();
  const notificationsUnsubscribe = useRef(null);
  const backPressedTimeRef = useRef(0);
  const screenTransitionAnim = useRef(new Animated.Value(1)).current;

  const tabScreens = ["dashboard", "activity", "map", "Leaderboard", "community"];

  const navigateWithAnimation = useCallback((newScreen, params = {}) => {
    if (newScreen === activeScreen) return;

    const isTabSwitch = tabScreens.includes(activeScreen) && tabScreens.includes(newScreen);

    if (isTabSwitch) {
      setPreviousScreen(activeScreen);
      setActiveScreen(newScreen);
      if (Object.keys(params).length > 0) {
        setActivityParams(params);
      }
    } else {
      setPreviousScreen(activeScreen);

      Animated.sequence([
        Animated.timing(screenTransitionAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(screenTransitionAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveScreen(newScreen);
        if (Object.keys(params).length > 0) {
          setActivityParams(params);
        }
      });
    }
  }, [activeScreen, screenTransitionAnim]);

  useEffect(() => {
    NotificationService.initialize();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      fetchNotificationCount();
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const { data } = response.notification.request.content;
      handleNotificationNavigation(data);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
      if (notificationsUnsubscribe.current) {
        notificationsUnsubscribe.current();
      }
    };
  }, []);

  useEffect(() => {
    const handleBackPress = () => {
      if (isNavigationLocked) return true;

      if (["activity", "profile", "community", "Leaderboard", "map"].includes(activeScreen)) {
        if (["activity", "profile", "community", "Leaderboard"].includes(activeScreen)) {
          navigateWithAnimation("dashboard");
          return true;
        }
        if (activeScreen === "map") {
          navigateWithAnimation("activity", activityParams);
          return true;
        }
        return false;
      }

      if (["dashboard", "landing"].includes(activeScreen)) {
        const currentTime = new Date().getTime();
        if (currentTime - backPressedTimeRef.current < 2000) {
          saveAppState();
          BackHandler.exitApp();
          return true;
        }
        backPressedTimeRef.current = currentTime;
        ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
        return true;
      }

      if (["signin", "signup"].includes(activeScreen)) {
        navigateWithAnimation("landing");
        return true;
      }

      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
    return () => backHandler.remove();
  }, [activeScreen, isNavigationLocked, activityParams]);

  const saveAppState = async () => {
    try {
      await AsyncStorage.setItem("lastActiveScreen", activeScreen);
      if (activityParams && Object.keys(activityParams).length > 0) {
        await AsyncStorage.setItem("activityParams", JSON.stringify(activityParams));
      }
    } catch (error) {
      console.error("Error saving app state:", error);
    }
  };

  const handleNotificationNavigation = (data) => {
    if (!data) return;
    if (data.type === "friendRequest" || data.type === "challenge" || data.type === "message") {
      navigateWithAnimation("community");
    } else if (data.type === "activity") {
      navigateWithAnimation("activity");
    }
  };

  const fetchNotificationCount = useCallback(() => {
    const user = auth.currentUser;
    if (!user) return;

    if (notificationsUnsubscribe.current) {
      notificationsUnsubscribe.current();
    }

    const notificationsRef = collection(db, "notifications");
    const unreadQuery = query(notificationsRef, where("userId", "==", user.uid), where("read", "==", false));

    const unsubscribe = onSnapshot(
      unreadQuery,
      (querySnapshot) => {
        setNotificationCount(querySnapshot.size);
      },
      (error) => {
        console.error("Error in notifications listener:", error);
      },
    );

    notificationsUnsubscribe.current = unsubscribe;
  }, []);

  useEffect(() => {
    const initApp = async () => {
      console.log("initApp started");
      try {
        // Initialize user data and session
        const { userData: loadedUserData, isValidSession } = await initializeUserData(auth.currentUser, setUserData);
        console.log("initializeUserData returned:", { userData: loadedUserData, isValidSession });

        // Check location permissions
        const hasPermissions = await checkLocationPermissions();
        setLocationGranted(hasPermissions);
        if (!hasPermissions) {
          console.log("Requesting location permissions");
          const granted = await requestLocationPermissions(setModalTitle, setModalMessage, setModalVisible);
          setLocationGranted(granted);
        }

        // Subscribe to auth state changes
        let authInitialized = false;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          console.log("onAuthStateChanged triggered with user:", user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified } : null);
          authInitialized = true;

          try {
            const { userData: loadedUserData, isValidSession } = await initializeUserData(user, setUserData);
            console.log("initializeUserData in auth state change:", { userData: loadedUserData, isValidSession });

            if (user && user.emailVerified) {
              console.log("User is logged in and email verified");
              const lastScreen = await AsyncStorage.getItem("lastActiveScreen");
              const targetScreen = lastScreen && ["dashboard", "activity", "profile", "community", "Leaderboard"].includes(lastScreen)
                ? lastScreen
                : "dashboard";
              console.log(`Navigating to ${targetScreen}`);
              navigateWithAnimation(targetScreen);
              if (targetScreen === "activity") {
                const savedParams = await AsyncStorage.getItem("activityParams");
                if (savedParams) {
                  setActivityParams(safeParseJSON(savedParams, {}));
                }
              }
              fetchNotificationCount();
            } else if (user && !user.emailVerified) {
              console.log("User logged in but email not verified");
              if (!verificationModalShown) {
                setModalVisible(true);
                setModalTitle("Email Verification Required");
                setModalMessage("Please verify your email to access all features.");
                setVerificationModalShown(true);
                navigateWithAnimation("signin", { email: user.email });
              }
            } else if (isValidSession) {
              console.log("No active user but valid cached session found");
              const lastScreen = await AsyncStorage.getItem("lastActiveScreen");
              const targetScreen = lastScreen && ["dashboard", "activity", "profile", "community", "Leaderboard"].includes(lastScreen)
                ? lastScreen
                : "dashboard";
              console.log(`Navigating to ${targetScreen}`);
              navigateWithAnimation(targetScreen);
              if (targetScreen === "activity") {
                const savedParams = await AsyncStorage.getItem("activityParams");
                if (savedParams) {
                  setActivityParams(safeParseJSON(savedParams, {}));
                }
              }
              fetchNotificationCount();
            } else {
              console.log("No user or valid cached session, navigating to landing");
              await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
              setUserData({
                username: "User",
                email: "user@example.com",
                avatar: "https://randomuser.me/api/portraits/men/1.jpg",
                uid: null,
                privacySettings: {
                  showProfile: true,
                  showActivities: true,
                  showStats: true,
                },
                avgDailySteps: 5000,
                avgDailyDistance: 2.5,
                avgActiveDuration: 45,
                avgDailyReps: 20,
                level: 1,
                totalXP: 0,
              });
              navigateWithAnimation("landing");
              setNotificationCount(0);
              if (notificationsUnsubscribe.current) {
                notificationsUnsubscribe.current();
                notificationsUnsubscribe.current = null;
              }
            }
          } catch (error) {
            console.error("Error in onAuthStateChanged:", error.message);
            navigateWithAnimation("landing");
            setNotificationCount(0);
            if (notificationsUnsubscribe.current) {
              notificationsUnsubscribe.current();
              notificationsUnsubscribe.current = null;
            }
          } finally {
            setIsNavigationLocked(false);
            setIsInitializing(false);
            await SplashScreen.hideAsync();
          }
        });

        // Timeout to handle delayed Firebase initialization
        setTimeout(async () => {
          if (!authInitialized) {
            console.log("onAuthStateChanged did not fire, checking cached session");
            const storedSession = await AsyncStorage.getItem("userSession");
            const sessionData = safeParseJSON(storedSession, null);
            if (sessionData?.uid && sessionData.emailVerified) {
              const { userData: loadedUserData, isValidSession } = await initializeUserData(null, setUserData);
              if (isValidSession) {
                const lastScreen = await AsyncStorage.getItem("lastActiveScreen");
                const targetScreen = lastScreen && ["dashboard", "activity", "profile", "community", "Leaderboard"].includes(lastScreen)
                  ? lastScreen
                  : "dashboard";
                console.log(`Navigating to ${targetScreen}`);
                navigateWithAnimation(targetScreen);
                if (targetScreen === "activity") {
                  const savedParams = await AsyncStorage.getItem("activityParams");
                  if (savedParams) {
                    setActivityParams(safeParseJSON(savedParams, {}));
                  }
                }
                fetchNotificationCount();
              } else {
                await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
                navigateWithAnimation("landing");
                setNotificationCount(0);
              }
            } else {
              console.log("No valid session, navigating to landing");
              await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
              navigateWithAnimation("landing");
              setNotificationCount(0);
            }
            setIsNavigationLocked(false);
            setIsInitializing(false);
            await SplashScreen.hideAsync();
          }
        }, 7000);

        return unsubscribe;
      } catch (error) {
        console.error("Error in initApp:", error.message);
        await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
        navigateWithAnimation("landing");
        setIsNavigationLocked(false);
        setNotificationCount(0);
        setIsInitializing(false);
        await SplashScreen.hideAsync();
      }
    };

    initApp();
  }, [fetchNotificationCount, verificationModalShown]);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  const navigateToMap = useCallback((params = {}) => {
    if (isNavigationLocked) return;
    if (!locationGranted) {
      setModalTitle("Location Required");
      setModalMessage("Please enable location services to use this feature.");
      setModalVisible(true);
      return;
    }
    if (params.stats) {
      params.stats = {
        distance: Number(params.stats.distance || 0),
        duration: Number(params.stats.duration || 0),
        pace: Number(params.stats.pace || 0),
        avgSpeed: Number(params.stats.avgSpeed || 0),
        steps: Number(params.stats.steps || 0),
      };
    }
    navigateWithAnimation("map", params);
  }, [isNavigationLocked, locationGranted, navigateWithAnimation]);

  const navigateToActivity = (params = {}) => {
    if (params.stats) {
      params.stats = {
        distance: Number(params.stats.distance || 0),
        duration: Number(params.stats.duration || 0),
        pace: Number(params.stats.pace || 0),
        avgSpeed: Number(params.stats.avgSpeed || 0),
        steps: Number(params.stats.steps || 0),
      };
    }
    console.log("Navigating to activity with params:", params);
    navigateWithAnimation("activity", params);
    setIsNavigationLocked(false);
  };

  const navigateToDashboard = () => {
    setActivityParams({});
    navigateWithAnimation("dashboard");
    setIsNavigationLocked(false);
  };

  const navigateToCommunity = () => {
    navigateWithAnimation("community");
    setIsNavigationLocked(false);
  };

  const navigateToSignIn = (email = "") => {
    setLoginEmail(email);
    navigateWithAnimation("signin");
    setIsNavigationLocked(true);
  };

  const navigateToSignUp = () => {
    navigateWithAnimation("signup");
    setIsNavigationLocked(true);
  };

  const navigateToLanding = () => {
    navigateWithAnimation("landing");
    setIsNavigationLocked(false);
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning! Let's start the day strong!";
    if (hour < 17) return "Good Afternoon! Keep up the great work!";
    if (hour < 20) return "Good Evening! You're doing awesome!";
    return "Good Night! But if you're up for it, keep pushing your limits tonight!";
  };

  if (isInitializing) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center`}>
        <StatusBar style={Platform.OS === "android" ? "light" : "dark"} backgroundColor="#121826" />
      </View>
    );
  }

  if (!fontsLoaded) return null;

  const StatusBarSpacer = () => <View style={Platform.OS === "android" ? twrnc`bg-[#121826] h-8` : twrnc`h-0`} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={Platform.OS === "android" ? "light" : "dark"} backgroundColor="#121826" />
        <View style={twrnc`flex-1 bg-[#121826]`} onLayout={onLayoutRootView}>
          <StatusBarSpacer />

          {!locationGranted && (
            <View style={twrnc`bg-[#FFC107] p-[${responsivePadding.base}px] mx-4 rounded-xl mb-2`}>
              <CustomText weight="medium" style={twrnc`text-[#121826] text-[${responsiveFontSizes.base}px] text-center`}>
                Location permissions are required for full functionality.
              </CustomText>
            </View>
          )}

          <CustomModal
            visible={modalVisible}
            title={modalTitle}
            message={modalMessage}
            onClose={() => {
              setModalVisible(false);
              setIsNavigationLocked(false);
              navigateToSignIn();
            }}
          />

          <NotificationDropdown
            visible={notificationDropdownVisible}
            onClose={() => setNotificationDropdownVisible(false)}
            navigateToActivity={navigateToActivity}
            navigateToCommunity={navigateToCommunity}
          />

          <Animated.View
            style={[
              { flex: 1 },
              {
                opacity: screenTransitionAnim,
                transform: [
                  {
                    translateY: screenTransitionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <AnimatedScreenWrapper isActive={activeScreen === "dashboard"} animationType="fade">
              <View style={twrnc`p-[${responsivePadding.lg}px]`}>
                <CustomText style={twrnc`text-gray-400 text-[${responsiveFontSizes.sm}px]`}>{formatDate()}</CustomText>
                <View style={twrnc`flex-row justify-between items-center mt-2`}>
                  <View style={twrnc`flex-1 flex-row items-center`}>
                    <CustomText
                      weight="bold"
                      style={twrnc`text-white text-[${isSmallDevice ? responsiveFontSizes.xl : responsiveFontSizes["2xl"]}px] flex-shrink-1`}
                      numberOfLines={null}
                      ellipsizeMode="tail"
                    >
                      {getTimeBasedGreeting()}, {userData.username || "User"}!
                    </CustomText>
                  </View>
                  <View style={twrnc`flex-row`}>
                    <TouchableOpacity
                      style={twrnc`bg-[#2A2E3A] rounded-full w-12 h-12 items-center justify-center mr-3 relative shadow-lg p-[${responsivePadding.base}px]`}
                      onPress={() => setNotificationDropdownVisible(true)}
                    >
                      <FontAwesome name="bell" size={responsiveFontSizes.lg} color="#fff" />
                      {notificationCount > 0 && (
                        <View
                          style={twrnc`absolute -top-1 -right-1 bg-[#EF476F] rounded-full min-w-5 h-5 items-center justify-center px-1`}
                        >
                          <CustomText weight="bold" style={twrnc`text-white text-[${responsiveFontSizes.xs}px]`}>
                            {notificationCount > 99 ? "99+" : notificationCount}
                          </CustomText>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={twrnc`bg-[#2A2E3A] rounded-full w-12 h-12 items-center justify-center shadow-lg p-[${responsivePadding.base}px]`}
                      onPress={() => navigateWithAnimation("profile")}
                    >
                      <FontAwesome name="user" size={responsiveFontSizes.lg} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <DashboardScreen navigateToActivity={navigateToActivity} userData={userData} />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "landing"} animationType="fade">
              <LandingScreen navigateToSignIn={navigateToSignIn} navigateToSignUp={navigateToSignUp} />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "signin"} animationType="scale">
              <LoginScreen
                navigateToLanding={navigateToLanding}
                navigateToSignUp={navigateToSignUp}
                navigateToDashboard={navigateToDashboard}
                prefilledEmail={loginEmail}
                setUserData={setUserData}
              />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "signup"} animationType="scale">
              <SignupScreen
                navigateToLanding={navigateToLanding}
                navigateToSignIn={navigateToSignIn}
                setIsNavigationLocked={setIsNavigationLocked}
                setUserData={setUserData}
              />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "activity"} animationType="fade">
              <ActivityScreen
                navigateToDashboard={navigateToDashboard}
                navigateToMap={navigateToMap}
                params={activityParams}
              />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "profile"} animationType="fade">
              <ProfileScreen
                navigateToDashboard={navigateToDashboard}
                navigateToLanding={navigateToLanding}
                navigateToSignIn={navigateToSignIn}
              />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "community"} animationType="fade">
              <CommunityScreen
                navigateToDashboard={navigateToDashboard}
                navigateToActivity={navigateToActivity}
              />
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "Leaderboard"} animationType="fade">
              {auth.currentUser ? (
                <LeaderboardScreen navigateToDashboard={navigateToDashboard} />
              ) : (
                <View style={twrnc`flex-1 bg-[#121826] justify-center items-center px-[${responsivePadding.lg}px]`}>
                  <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-[${responsivePadding.lg}px] items-center shadow-lg`}>
                    <FontAwesome name="lock" size={responsiveFontSizes["2xl"]} color="#FFC107" style={twrnc`mb-4`} />
                    <CustomText weight="semibold" style={twrnc`text-white text-[${responsiveFontSizes.lg}px] text-center mb-4`}>
                      Please sign in to view the leaderboard.
                    </CustomText>
                    <TouchableOpacity style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl shadow-lg`} onPress={navigateToSignIn}>
                      <CustomText weight="semibold" style={twrnc`text-white text-[${responsiveFontSizes.base}px]`}>
                        Sign In
                      </CustomText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </AnimatedScreenWrapper>

            <AnimatedScreenWrapper isActive={activeScreen === "map"} animationType="fade">
              <MapScreen
                navigateToActivity={navigateToActivity}
                navigateToDashboard={navigateToDashboard}
                params={activityParams}
              />
            </AnimatedScreenWrapper>
          </Animated.View>

          {(activeScreen === "dashboard" || activeScreen === "profile" || activeScreen === "Leaderboard") && (
            <Animated.View
              style={[
                twrnc`flex-row justify-between items-center bg-[#1E2538] px-[${responsivePadding.lg}px] py-[${responsivePadding.base}px] absolute bottom-0 w-full shadow-2xl`,
                {
                  opacity: screenTransitionAnim,
                  transform: [
                    {
                      translateY: screenTransitionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [50, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <AnimatedNavTab
                icon="home"
                label="Home"
                isActive={activeScreen === "dashboard"}
                onPress={() => navigateWithAnimation("dashboard")}
              />
              <AnimatedNavTab
                iconSource={RunningIcon}
                label="Activity"
                isActive={activeScreen === "activity"}
                onPress={() => navigateWithAnimation("activity")}
              />
              <EnhancedMapButton
                onPress={() => navigateToMap({})}
                isActive={activeScreen === "map"}
              />
              <AnimatedNavTab
                icon="trophy"
                label="Leaderboard"
                isActive={activeScreen === "Leaderboard"}
                onPress={() => navigateWithAnimation("Leaderboard")}
              />
              <AnimatedNavTab
                icon="users"
                label="Community"
                isActive={activeScreen === "community"}
                onPress={() => navigateWithAnimation("community")}
              />
            </Animated.View>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
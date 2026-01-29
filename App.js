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
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import twrnc from "twrnc";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, onSnapshot, setDoc } from "firebase/firestore";
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
import StoryScreen from "./screens/StoryScreen";
import CustomText from "./components/CustomText";
import CustomModal from "./components/CustomModal";
import NotificationDropdown from "./components/NotificationDropdown";
import NotificationService from "./services/NotificationService";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get("window");

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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
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
  try {
    const defaultUserData = {
      username: "User",
      email: "user@example.com",
      avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
      uid: null,
      privacySettings: {
        showProfile: true,
        showActivities: true,
        showStats: true,
      },
      avgDailyDistance: 0,
      avgActiveDuration: 0,
      avgDailyReps: 0,
      level: 1,
      totalXP: 0,
    };

    let userData = { ...defaultUserData };
    let isValidSession = false;

    const storedSession = await AsyncStorage.getItem("userSession");
    const sessionData = safeParseJSON(storedSession, null);

    if (user && user.emailVerified) {
      isValidSession = true;
      userData = await fetchUserDataFromFirestore(user.uid, defaultUserData);
      await AsyncStorage.setItem("userSession", JSON.stringify({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        lastLogin: new Date().toISOString(),
      }));
      setUserData(userData);
    } else if (sessionData?.uid && sessionData.emailVerified) {
      try {
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
        hasSeenIntro: firestoreData.hasSeenIntro, // Ensure this is returned
      };
    } else {
      const newUserData = { ...defaultUserData, uid };
      await setDoc(userDocRef, newUserData);
      return newUserData;
    }
  } catch (error) {
    console.error("Error fetching user data from Firestore:", error.message);
    return { ...defaultUserData };
  }
};

// Time-Based Greeting Component
const TimeBasedGreeting = ({ userData }) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: "Good Morning", messages: motivationalMessages.morning };
    if (hour < 17) return { greeting: "Good Afternoon", messages: motivationalMessages.afternoon };
    if (hour < 20) return { greeting: "Good Evening", messages: motivationalMessages.evening };
    return { greeting: "Good Night", messages: motivationalMessages.night };
  };

  const motivationalMessages = {
    morning: ["Rise and shine!", "New day, new energy!", "Make today count!", "Morning moves matter!", "Start strong!", "Seize the day!"],
    afternoon: ["Keep it up!", "Stay focused!", "You're crushing it!", "Halfway there!", "Push forward!", "Making progress!"],
    evening: ["Great work today!", "Finish strong!", "Almost there!", "Proud of you!", "End on a high note!", "You did amazing!"],
    night: ["Rest and recover!", "Dream big tonight!", "Tomorrow awaits!", "Recharge for tomorrow!", "Sleep well, achieve more!", "You earned this rest!"]
  };

  const { greeting, messages } = getTimeBasedGreeting();

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -10,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start(() => {
        setCurrentMessageIndex((prevIndex) =>
          prevIndex >= messages.length - 1 ? 0 : prevIndex + 1
        );
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          })
        ]).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <View>
      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
        {greeting}, {userData.username || "User"}!
      </CustomText>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <CustomText style={[twrnc`text-xs font-semibold`, { color: '#FFD700' }]}>
          {messages[currentMessageIndex]}
        </CustomText>
      </Animated.View>
    </View>
  );
};

// Smooth Screen Wrapper Component (no bouncing)
const AnimatedScreenWrapper = ({ children, isActive }) => {
  const fadeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    if (isActive) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.ease,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Animated.View
      style={[
        twrnc`flex-1`,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const AnimatedNavTab = ({ icon, label, isActive, onPress, isCenterButton }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => onPress());
  }, [onPress, scaleAnim]);

  if (isCenterButton) {
    return (
      <View style={twrnc`flex-1 items-center justify-center`}>
        {/* Static Pulse Rings */}
        <View style={twrnc`absolute items-center justify-center -mt-15`}>
          {/* Ring 1 */}
          <View
            style={[
              twrnc`w-24 h-24 rounded-full absolute`,
              {
                borderWidth: 2,
                borderColor: '#FFD700',
                opacity: 0.3,
              },
            ]}
          />
          {/* Ring 2 */}
          <View
            style={[
              twrnc`w-28 h-28 rounded-full absolute`,
              {
                borderWidth: 2,
                borderColor: '#FFD700',
                opacity: 0.2,
              },
            ]}
          />
          {/* Ring 3 */}
          <View
            style={[
              twrnc`w-32 h-32 rounded-full absolute`,
              {
                borderWidth: 2,
                borderColor: '#FFD700',
                opacity: 0.1,
              },
            ]}
          />
        </View>

        {/* Main Gold Button */}
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          style={[
            twrnc`w-20 h-20 rounded-full items-center justify-center -mt-15`,
            {
              backgroundColor: "#FFD700",
              shadowColor: "#FFD700",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 100,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name={icon} size={40} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={twrnc`flex-1 items-center justify-center py-3`}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          twrnc`items-center justify-center`,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={icon}
          size={24}
          color={isActive ? "#FFFFFF" : "#64748B"}
        />
        <CustomText
          weight={isActive ? "semibold" : "regular"}
          style={[
            twrnc`text-[10px] mt-1`,
            { color: isActive ? "#FFFFFF" : "#64748B" },
          ]}
        >
          {label}
        </CustomText>
      </Animated.View>
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

  const tabScreens = ["dashboard", "activity", "map", "Leaderboard", "community", "story"];

  const navigateWithAnimation = useCallback((newScreen, params = {}) => {
    if (newScreen === activeScreen) return;

    setPreviousScreen(activeScreen);
    setActiveScreen(newScreen);

    if (Object.keys(params).length > 0) {
      setActivityParams(params);
    }
  }, [activeScreen]);

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
    let userDataUnsubscribe = null; // Store the Firestore listener cleanup function

    const initApp = async () => {
      try {
        const isLogoutScenario = await AsyncStorage.getItem("isLoggingOut");
        const { userData: loadedUserData, isValidSession } = await initializeUserData(auth.currentUser, setUserData);

        const hasPermissions = await checkLocationPermissions();
        setLocationGranted(hasPermissions);
        if (!hasPermissions) {
          const granted = await requestLocationPermissions(setModalTitle, setModalMessage, setModalVisible);
          setLocationGranted(granted);
        }

        let authInitialized = false;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          authInitialized = true;
          try {
            const { userData: loadedUserData, isValidSession } = await initializeUserData(user, setUserData);
            const isLogoutScenario = await AsyncStorage.getItem("isLoggingOut");

            // ✅ Clean up previous listener if exists
            if (userDataUnsubscribe) {
              userDataUnsubscribe();
              userDataUnsubscribe = null;
            }

            if (user && user.emailVerified) {
              await AsyncStorage.removeItem("isLoggingOut");

              // ✅ SET UP REAL-TIME LISTENER FOR USER DATA
              const userRef = doc(db, "users", user.uid);
              userDataUnsubscribe = onSnapshot(
                userRef,
                (docSnapshot) => {
                  if (docSnapshot.exists()) {
                    const firestoreData = docSnapshot.data();

                    setUserData((prevData) => ({
                      ...prevData,
                      username: firestoreData.username || prevData.username,
                      email: firestoreData.email || prevData.email,
                      avatar: firestoreData.avatar || prevData.avatar,
                      uid: user.uid,
                      privacySettings: firestoreData.privacySettings || prevData.privacySettings,
                      avgDailySteps: firestoreData.avgDailySteps || prevData.avgDailySteps,
                      avgDailyDistance: firestoreData.avgDailyDistance || prevData.avgDailyDistance,
                      avgActiveDuration: firestoreData.avgActiveDuration || prevData.avgActiveDuration,
                      avgDailyReps: firestoreData.avgDailyReps || prevData.avgDailyReps,
                      level: firestoreData.level || prevData.level,
                      totalXP: firestoreData.totalXP || prevData.totalXP,
                      totalDistance: firestoreData.totalDistance || 0,
                      totalDuration: firestoreData.totalDuration || 0,
                      totalReps: firestoreData.totalReps || 0,
                      totalActivities: firestoreData.totalActivities || 0,
                      totalStrengthDuration: firestoreData.totalStrengthDuration || 0,
                      friends: firestoreData.friends || [],
                      deviceType: firestoreData.deviceType || [],
                      pushToken: firestoreData.pushToken || [],
                      isOnline: firestoreData.isOnline || false,
                      createdAt: firestoreData.createdAt || null,
                      lastSeen: firestoreData.lastSeen || null,
                      lastActivityDate: firestoreData.lastActivityDate || null,
                      lastQuestCompleted: firestoreData.lastQuestCompleted || null,
                      hasSeenIntro: firestoreData.hasSeenIntro,
                    }));

                    // --- CHECK FOR INTRO STORY ---
                    // If the user hasn't seen the intro yet, redirect them to the StoryScreen
                    if (firestoreData.hasSeenIntro === false) {
                      navigateWithAnimation("story", { isIntro: true });
                    }
                    // -----------------------------

                    // Update AsyncStorage cache
                    AsyncStorage.setItem("userData", JSON.stringify(firestoreData)).catch((err) => {
                      console.warn("Could not cache user data", err);
                    });
                  }
                },
                (error) => {
                  console.error("Error in user data listener:", error);
                }
              );

              const lastScreen = await AsyncStorage.getItem("lastActiveScreen");
              // Default to dashboard, but the onSnapshot listener above will redirect to "story" if needed
              const targetScreen = lastScreen && ["dashboard", "activity", "profile", "community", "Leaderboard"].includes(lastScreen)
                ? lastScreen
                : "dashboard";
              navigateWithAnimation(targetScreen);

              if (targetScreen === "activity") {
                const savedParams = await AsyncStorage.getItem("activityParams");
                if (savedParams) {
                  setActivityParams(safeParseJSON(savedParams, {}));
                }
              }
              fetchNotificationCount();
            } else if (user && !user.emailVerified) {
              await AsyncStorage.removeItem("isLoggingOut");
              if (!verificationModalShown) {
                setModalVisible(true);
                setModalTitle("Email Verification Required");
                setModalMessage("Please verify your email to access all features.");
                setVerificationModalShown(true);
                navigateWithAnimation("signin", { email: user.email });
              }
            } else if (isValidSession && user) {
              await AsyncStorage.removeItem("isLoggingOut");

              // ✅ SET UP REAL-TIME LISTENER FOR VALID SESSION
              const userRef = doc(db, "users", user.uid);
              userDataUnsubscribe = onSnapshot(
                userRef,
                (docSnapshot) => {
                  if (docSnapshot.exists()) {
                    const firestoreData = docSnapshot.data();

                    setUserData((prevData) => ({
                      ...prevData,
                      username: firestoreData.username || prevData.username,
                      email: firestoreData.email || prevData.email,
                      avatar: firestoreData.avatar || prevData.avatar,
                      uid: user.uid,
                      privacySettings: firestoreData.privacySettings || prevData.privacySettings,
                      avgDailySteps: firestoreData.avgDailySteps || prevData.avgDailySteps,
                      avgDailyDistance: firestoreData.avgDailyDistance || prevData.avgDailyDistance,
                      avgActiveDuration: firestoreData.avgActiveDuration || prevData.avgActiveDuration,
                      avgDailyReps: firestoreData.avgDailyReps || prevData.avgDailyReps,
                      level: firestoreData.level || prevData.level,
                      totalXP: firestoreData.totalXP || prevData.totalXP,
                      totalDistance: firestoreData.totalDistance || 0,
                      totalDuration: firestoreData.totalDuration || 0,
                      totalReps: firestoreData.totalReps || 0,
                      totalActivities: firestoreData.totalActivities || 0,
                      totalStrengthDuration: firestoreData.totalStrengthDuration || 0,
                      friends: firestoreData.friends || [],
                      deviceType: firestoreData.deviceType || [],
                      pushToken: firestoreData.pushToken || [],
                      isOnline: firestoreData.isOnline || false,
                      createdAt: firestoreData.createdAt || null,
                      lastSeen: firestoreData.lastSeen || null,
                      lastActivityDate: firestoreData.lastActivityDate || null,
                      lastQuestCompleted: firestoreData.lastQuestCompleted || null,
                      hasSeenIntro: firestoreData.hasSeenIntro,
                    }));

                    // --- CHECK FOR INTRO STORY (Session Case) ---
                    if (firestoreData.hasSeenIntro === false) {
                      navigateWithAnimation("story", { isIntro: true });
                    }
                    // --------------------------------------------

                    AsyncStorage.setItem("userData", JSON.stringify(firestoreData)).catch((err) => {
                      console.warn("Could not cache user data", err);
                    });
                  }
                },
                (error) => {
                  console.error("Error in user data listener:", error);
                }
              );

              const lastScreen = await AsyncStorage.getItem("lastActiveScreen");
              const targetScreen = lastScreen && ["dashboard", "activity", "profile", "community", "Leaderboard"].includes(lastScreen)
                ? lastScreen
                : "dashboard";
              navigateWithAnimation(targetScreen);
              if (targetScreen === "activity") {
                const savedParams = await AsyncStorage.getItem("activityParams");
                if (savedParams) {
                  setActivityParams(safeParseJSON(savedParams, {}));
                }
              }
              fetchNotificationCount();
            } else {
              // User is logged out
              if (isLogoutScenario === "true") {
                await AsyncStorage.removeItem("isLoggingOut");
                await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
                setUserData({
                  username: "User",
                  email: "user@example.com",
                  avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
                  uid: null,
                  privacySettings: { showProfile: true, showActivities: true, showStats: true },
                  avgDailySteps: 5000,
                  avgDailyDistance: 2.5,
                  avgActiveDuration: 45,
                  avgDailyReps: 20,
                  level: 1,
                  totalXP: 0,
                });
                navigateWithAnimation("signin");
                setNotificationCount(0);
              } else {
                await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams"]);
                setUserData({
                  username: "User",
                  email: "user@example.com",
                  avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
                  uid: null,
                  privacySettings: { showProfile: true, showActivities: true, showStats: true },
                  avgDailySteps: 5000,
                  avgDailyDistance: 2.5,
                  avgActiveDuration: 45,
                  avgDailyReps: 20,
                  level: 1,
                  totalXP: 0,
                });
                navigateWithAnimation("landing");
                setNotificationCount(0);
              }
              if (notificationsUnsubscribe.current) {
                notificationsUnsubscribe.current();
                notificationsUnsubscribe.current = null;
              }
            }
          } catch (error) {
            console.error("Error in onAuthStateChanged:", error.message);
            await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams", "isLoggingOut"]);
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

        return () => {
          // ✅ Cleanup both auth and user data listeners
          unsubscribe();
          if (userDataUnsubscribe) {
            userDataUnsubscribe();
          }
        };
      } catch (error) {
        console.error("Error in initApp:", error.message);
        await AsyncStorage.multiRemove(["userSession", "lastActiveScreen", "activityParams", "isLoggingOut"]);
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

  const navigateToProfile = () => {
    navigateWithAnimation('profile');
    setIsNavigationLocked(false);
  };

  const navigateToSignIn = (email = "") => {
    setLoginEmail(email);
    navigateWithAnimation("signin");
    setIsNavigationLocked(true);
  };

  const updateUserData = (newUserData) => {
    setUserData(prevData => ({
      ...prevData,
      ...newUserData
    }));
  };

  const navigateToSignUp = () => {
    navigateWithAnimation("signup");
    setIsNavigationLocked(true);
  };

  const navigateToLanding = () => {
    navigateWithAnimation("landing");
    setIsNavigationLocked(false);
  };

  if (isInitializing) {
    return (
      <View style={twrnc`flex-1 bg-[#0f172a] items-center justify-center`}>
        <CustomText style={twrnc`text-white text-lg`}>Loading...</CustomText>
      </View>
    );
  }

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={twrnc`flex-1`}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={twrnc`flex-1 bg-[#0f172a]`} onLayout={onLayoutRootView}>
          {!locationGranted && (
            <View style={twrnc`bg-red-500 p-2`}>
              <CustomText style={twrnc`text-white text-center text-xs`}>
                Location permissions are required for full functionality.
              </CustomText>
            </View>
          )}

          <CustomModal
            title={modalTitle}
            message={modalMessage}
            type="error"
            visible={modalVisible}
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

          {/* HEADER - ONLY ON DASHBOARD */}
          {activeScreen === "dashboard" && (
            <View style={[twrnc`px-5 pt-12 `, { backgroundColor: "#1e293b" }]}>
              <View style={twrnc`flex-row justify-between items-center mb-3`}>
                <View style={twrnc`flex-1`}>
                  {/* Date */}
                  <CustomText style={[twrnc`text-[13px] font-semibold pt-2 mb-2 text-gray-400`]}>
                    {formatDate()}
                  </CustomText>
                  <TimeBasedGreeting userData={userData} />

                </View>

                <View style={twrnc`flex-row items-center gap-3`}>
                  {/* Notification Bell */}
                  <TouchableOpacity
                    style={twrnc`relative bg-[#0f172a] p-2.5 rounded-xl`}
                    onPress={() => setNotificationDropdownVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
                    {notificationCount > 0 && (
                      <View style={[twrnc`absolute -top-1 -right-1 bg-[#EF476F] rounded-full min-w-[18px] h-[18px] items-center justify-center px-1`]}>
                        <CustomText weight="bold" style={twrnc`text-white text-[9px]`}>
                          {notificationCount > 99 ? "99+" : notificationCount}
                        </CustomText>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Profile Avatar */}
                  <TouchableOpacity
                    onPress={() => navigateWithAnimation("profile")}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: userData.avatar }}
                      style={twrnc`w-10 h-10 rounded-xl`}
                    />
                  </TouchableOpacity>
                </View>
              </View>


            </View>
          )}

          <AnimatedScreenWrapper isActive={activeScreen === "story"}>
            <StoryScreen
              navigation={{
                navigate: navigateWithAnimation,
                goBack: () => navigateWithAnimation("dashboard")
              }}
              route={{ params: activityParams }} // Pass params here
            />
          </AnimatedScreenWrapper>

          {/* SCREENS */}
          <AnimatedScreenWrapper isActive={activeScreen === "landing"}>
            <LandingScreen navigateToSignIn={navigateToSignIn} navigateToSignUp={navigateToSignUp} />
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "signin"}>
            <LoginScreen
              navigation={{ navigate: navigateWithAnimation }} // ✅ PASSED NAVIGATION PROP
              navigateToDashboard={navigateToDashboard}
              navigateToSignUp={navigateToSignUp}
              initialEmail={loginEmail}
              setUserData={updateUserData}
            />
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "signup"}>
            <SignupScreen
              navigateToDashboard={navigateToDashboard}
              navigateToSignIn={navigateToSignIn}
              setIsNavigationLocked={setIsNavigationLocked}
            />

          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "dashboard"}>
            <DashboardScreen
              userData={userData}
              navigateToActivity={navigateToActivity}
              navigateToMap={navigateToMap}
              updateUserData={updateUserData}
              navigation={{ navigate: navigateWithAnimation }}
            />
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "activity"}>
            <ActivityScreen
              navigateToDashboard={navigateToDashboard}
              navigateToMap={navigateToMap}
              params={activityParams}
              userData={userData}
            />
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "profile"}>
            <ProfileScreen navigateToDashboard={navigateToDashboard} navigateToLanding={navigateToLanding} userData={userData} updateUserData={updateUserData} isActive={activeScreen === "profile"} />
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "community"}>
            <CommunityScreen
              navigateToActivity={navigateToActivity}
              userData={userData}
              navigateToDashboard={navigateToDashboard}
              navigateToProfile={navigateToProfile}
            />
          </AnimatedScreenWrapper>


          <AnimatedScreenWrapper isActive={activeScreen === "Leaderboard"}>
            {auth.currentUser ? (
              <LeaderboardScreen
                userData={userData}
                navigateToDashboard={navigateToDashboard}
              />
            ) : (
              <View style={twrnc`flex-1 items-center justify-center px-5`}>
                <CustomText style={twrnc`text-white text-center mb-5`}>
                  Please sign in to view the leaderboard.
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#4361EE] rounded-2xl px-8 py-3`}
                  onPress={navigateToSignIn}
                >
                  <CustomText weight="bold" style={twrnc`text-white`}>
                    Sign In
                  </CustomText>
                </TouchableOpacity>
              </View>
            )}
          </AnimatedScreenWrapper>

          <AnimatedScreenWrapper isActive={activeScreen === "map"}>
            <MapScreen
              navigateToDashboard={navigateToDashboard}
              navigateToActivity={navigateToActivity}
              params={activityParams}
            />
          </AnimatedScreenWrapper>

          {/* DARK CRYPTO-STYLE BOTTOM NAVIGATION - ONLY ON HOME AND LEADERBOARD */}
          {["dashboard", "Leaderboard"].includes(activeScreen) && (
            <View
              style={[
                twrnc`flex-row items-center px-2 py-2`,
                {
                  backgroundColor: "#0f172a",
                  borderTopWidth: 1,
                  borderTopColor: "#1e293b",
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
                icon="fitness"
                label="Activity"
                isActive={activeScreen === "activity"}
                onPress={() => navigateWithAnimation("activity")}
              />

              {/* Center Map Button */}
              <AnimatedNavTab
                icon="footsteps"
                isCenterButton={true}
                onPress={() => navigateToMap({})}
              />

              <AnimatedNavTab
                icon="trophy"
                label="Leaderboard"
                isActive={activeScreen === "Leaderboard"}
                onPress={() => navigateWithAnimation("Leaderboard")}
              />
              <AnimatedNavTab
                icon="people"
                label="Community"
                isActive={activeScreen === "community"}
                onPress={() => navigateWithAnimation("community")}
              />
            </View>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

}
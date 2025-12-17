"use client"

import { useState, useEffect, useRef } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Linking,
  Modal,
  Animated,
  Dimensions,
  SafeAreaView,
  FlatList,
} from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { FontAwesome, Ionicons } from "@expo/vector-icons"
import { auth, db } from "../firebaseConfig"
import { signOut } from "firebase/auth"
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc, orderBy, limit } from "firebase/firestore"
import * as ImagePicker from "expo-image-picker"
import axios from "axios"
import CustomModal from "../components/CustomModal"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { BadgeGrid, BadgeModal, AllBadgesModal } from "../components/BadgeComponents"

const { width, height } = Dimensions.get("window")

// Helper function to safely parse JSON
const safeParseJSON = (str, defaultValue = {}) => {
  try {
    return str ? JSON.parse(str) : defaultValue
  } catch (error) {
    console.error("JSON parse error:", error)
    return defaultValue
  }
}

// Format duration helper
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

// Get activity icon
const getActivityIcon = (activityType) => {
  switch (activityType) {
    case "running":
      return "walk"
    case "cycling":
      return "bicycle"
    case "walking":
      return "walk"
    case "jogging":
      return "walk"
    case "pushup":
    case "squat":
    case "situp":
      return "fitness"
    default:
      return "fitness"
  }
}

// Get activity color
const getActivityColor = (activityType) => {
  switch (activityType) {
    case "running":
      return "#EF476F"
    case "cycling":
      return "#06D6A0"
    case "walking":
      return "#4361EE"
    case "jogging":
      return "#FFC107"
    case "pushup":
      return "#9B5DE5"
    case "squat":
      return "#F15BB5"
    case "situp":
      return "#00BBF9"
    default:
      return "#4361EE"
  }
}

// Format Firestore timestamps
const formatTimestamp = (timestamp) => {
  if (!timestamp) return "—"
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp instanceof Date ? timestamp : null
  return date ? date.toLocaleDateString() : "—"
}

const ProfileScreen = ({ navigateToDashboard, navigateToLanding, navigateToSignIn }) => {
  // Drawer animation
  const drawerAnimation = useRef(new Animated.Value(-width)).current
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Modal states
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [showHelpSupportModal, setShowHelpSupportModal] = useState(false)
  const [showPrivacySettingsModal, setShowPrivacySettingsModal] = useState(false)

  // Badge System States
  const [badges, setBadges] = useState([])
  const [selectedBadge, setSelectedBadge] = useState(null)
  const [isBadgeModalVisible, setIsBadgeModalVisible] = useState(false)
  const [isAllBadgesModalVisible, setIsAllBadgesModalVisible] = useState(false)

  // Recent Activities State
  const [recentActivities, setRecentActivities] = useState([])

  // Form states
  const [editUsername, setEditUsername] = useState("")

  // User data
  const [userData, setUserData] = useState({
    username: "User",
    email: "user@example.com",
    avatar: "https://randomuser.me/api/portraits/men/1.jpg",
    level: 1,
    totalXP: 0,
    totalDistance: 0,
    totalDuration: 0,
    totalReps: 0,
    totalActivities: 0,
    totalSteps: 0,
    totalStrengthDuration: 0,
    friends: [],
    deviceType: "",
    pushToken: "",
    isOnline: false,
    createdAt: null,
    lastSeen: null,
    lastActivityDate: null,
    lastQuestCompleted: null,
    stats: {
      totalDistance: "0 km",
      totalActivities: "0",
      longestRun: "0 km",
    },
    badges: [],
    privacySettings: {
      showProfile: true,
      showActivities: true,
      showStats: true,
    },
  })

  // Loading states
  const [loading, setLoading] = useState(true)
  const [achievements, setAchievements] = useState([])
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingPrivacySettings, setSavingPrivacySettings] = useState(false)

  const [showAllActivities, setShowAllActivities] = useState(false)

  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dljywnlvh/image/upload"
  const CLOUDINARY_UPLOAD_PRESET = "profile"

  // FAQ content for Help & Support
  const faqItems = [
    {
      id: "1",
      question: "How do I track my activities?",
      answer:
        'To track your activities, go to the Dashboard and tap the "Start Activity" button. Choose your activity type and tap "Start". The app will track your route, distance, and duration automatically.',
    },
    {
      id: "2",
      question: "How do I earn badges?",
      answer:
        'Badges are earned by completing specific achievements. For example, complete your first 5km run to earn the "5K Runner" badge. Check the Achievements section to see what you need to do to earn each badge.',
    },
    {
      id: "3",
      question: "How can I reset my password?",
      answer:
        'To reset your password, go to the Login screen and tap "Forgot Password". Enter your email address and follow the instructions sent to your email.',
    },
  ]

  // Enhanced drawer menu items
  const drawerMenuItems = [
    {
      id: "edit_profile",
      title: "Edit Profile",
      description: "Update your personal information",
      icon: "user-circle",
      iconType: "FontAwesome",
      color: "#4361EE",
      bgColor: "#4361EE20",
      action: () => {
        closeDrawer()
        setTimeout(() => setShowEditProfileModal(true), 300)
      },
    },
    {
      id: "help_support",
      title: "Help & Support",
      description: "Get help and contact support",
      icon: "help-circle-outline",
      iconType: "Ionicons",
      color: "#FF6B35",
      bgColor: "#FF6B3520",
      action: () => {
        closeDrawer()
        setTimeout(() => setShowHelpSupportModal(true), 300)
      },
    },
    {
      id: "privacy_settings",
      title: "Privacy Settings",
      description: "Control your data visibility",
      icon: "shield-checkmark-outline",
      iconType: "Ionicons",
      color: "#9C27B0",
      bgColor: "#9C27B020",
      action: () => {
        closeDrawer()
        setTimeout(() => setShowPrivacySettingsModal(true), 300)
      },
    },
    {
      id: "divider",
      isDivider: true,
    },
    {
      id: "logout",
      title: "Logout",
      description: "Sign out of your account",
      icon: "log-out-outline",
      iconType: "Ionicons",
      color: "#EF4444",
      bgColor: "#EF444420",
      action: () => {
        closeDrawer()
        setTimeout(() => setShowLogoutModal(true), 300)
      },
    },
  ]

  // Badge System Functions
  const handleBadgePress = (badge) => {
    setSelectedBadge(badge)
    setIsBadgeModalVisible(true)
  }

  const handleViewAllBadges = () => {
    setIsAllBadgesModalVisible(true)
  }

  // Fetch recent activities
  const fetchRecentActivities = async (userId) => {
    try {
      const activitiesQuery = query(
        collection(db, "activities"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(5),
      )
      const activitiesSnapshot = await getDocs(activitiesQuery)
      const activities = activitiesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setRecentActivities(activities)
    } catch (error) {
      console.error("Error fetching recent activities:", error)
      setRecentActivities([])
    }
  }

  // Fetch badges from "user_badges"
  const fetchBadges = async (userId) => {
    try {
      const userBadgesRef = doc(db, "user_badges", userId);
      const snapshot = await getDoc(userBadgesRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const badgeList = data.badges || [];

        console.log("Fetched badges:", badgeList);
        setBadges(badgeList);
      } else {
        console.log("No badge document found for user:", userId);
        setBadges([]);
      }
    } catch (error) {
      console.error("Error fetching badges:", error);
      setBadges([]);
    }
  };



  const openDrawer = () => {
    setIsDrawerOpen(true)
    Animated.timing(drawerAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }

  const closeDrawer = () => {
    Animated.timing(drawerAnimation, {
      toValue: -width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsDrawerOpen(false)
    })
  }

  const selectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permissionResult.granted) {
        Alert.alert("Permission Denied", "Please grant access to your photo library to select an image.")
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (result.canceled) {
        console.log("User cancelled image picker")
        return
      }

      const uri = result.assets[0].uri
      const mimeType = result.assets[0].mimeType || "image/jpeg"
      await uploadImage(uri, mimeType)
    } catch (err) {
      console.error("Image picker error:", err.message, err.stack)
      Alert.alert("Error", "Failed to pick image. Please try again.")
    }
  }

  const uploadImage = async (uri, mimeType) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        type: mimeType,
        name: `profile.${mimeType.split("/")[1] || "jpg"}`,
      })
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET)

      const response = await axios.post(CLOUDINARY_URL, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })

      if (!response.data.secure_url) {
        console.error("Cloudinary response:", JSON.stringify(response.data, null, 2))
        throw new Error("No secure_url in Cloudinary response")
      }

      const imageUrl = response.data.secure_url
      await saveImageUrlToFirestore(imageUrl)
      setUserData((prev) => ({ ...prev, avatar: imageUrl }))
      Alert.alert("Success", "Profile picture updated successfully")

      // Update AsyncStorage with new avatar
      try {
        const cachedUserData = await AsyncStorage.getItem("userData")
        if (cachedUserData) {
          const parsedData = safeParseJSON(cachedUserData, {})
          parsedData.avatar = imageUrl
          await AsyncStorage.setItem("userData", JSON.stringify(parsedData))
        }
      } catch (storageErr) {
        console.warn("Could not update avatar in AsyncStorage:", storageErr)
      }
    } catch (err) {
      console.error("Cloudinary upload error:", err.message, err.response?.data)
      Alert.alert(
        "Error",
        `Failed to upload image: ${err.response?.data?.error?.message || "Please check your network and try again."}`,
      )
    } finally {
      setUploading(false)
    }
  }

  const saveImageUrlToFirestore = async (imageUrl) => {
    try {
      const user = auth.currentUser
      if (!user) {
        throw new Error("Not authenticated")
      }

      const userRef = doc(db, "users", user.uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        await updateDoc(userRef, { avatar: imageUrl })
      } else {
        await setDoc(userRef, { avatar: imageUrl, username: userData.username || "User", email: user.email })
      }

      console.log("Image URL saved to Firestore")
    } catch (err) {
      console.error("Firestore update error:", err)
      throw err
    }
  }

  const saveUsername = async () => {
    if (!editUsername.trim()) {
      Alert.alert("Error", "Username cannot be empty")
      return
    }

    if (editUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters long")
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(editUsername)) {
      Alert.alert("Error", "Username can only contain letters, numbers, and underscores")
      return
    }

    setSavingUsername(true)
    try {
      const user = auth.currentUser
      if (!user) {
        throw new Error("Not authenticated")
      }

      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, { username: editUsername })
      setUserData((prev) => ({ ...prev, username: editUsername }))
      setShowEditProfileModal(false)
      Alert.alert("Success", "Username updated successfully")

      // Update AsyncStorage with new username
      try {
        const cachedUserData = await AsyncStorage.getItem("userData")
        if (cachedUserData) {
          const parsedData = safeParseJSON(cachedUserData, {})
          parsedData.username = editUsername
          await AsyncStorage.setItem("userData", JSON.stringify(parsedData))
        }
      } catch (storageErr) {
        console.warn("Could not update username in AsyncStorage:", storageErr)
      }
    } catch (err) {
      console.error("Error updating username:", err)
      Alert.alert("Error", "Failed to update username. Please try again.")
    } finally {
      setSavingUsername(false)
    }
  }

  const savePrivacySettings = async () => {
    setSavingPrivacySettings(true)
    try {
      const user = auth.currentUser
      if (!user) {
        throw new Error("Not authenticated")
      }

      console.log("Saving privacy settings:", userData.privacySettings)
      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, { privacySettings: userData.privacySettings })

      // Update AsyncStorage with privacy settings
      try {
        const cachedUserData = await AsyncStorage.getItem("userData")
        if (cachedUserData) {
          const parsedData = safeParseJSON(cachedUserData, {})
          parsedData.privacySettings = userData.privacySettings
          await AsyncStorage.setItem("userData", JSON.stringify(parsedData))
        }
      } catch (storageErr) {
        console.warn("Could not update privacy settings in AsyncStorage:", storageErr)
      }

      setShowPrivacySettingsModal(false)
      Alert.alert("Success", "Privacy settings updated successfully")
    } catch (err) {
      console.error("Error updating privacy settings:", err)
      Alert.alert("Error", "Failed to update privacy settings. Please try again.")
    } finally {
      setSavingPrivacySettings(false)
    }
  }

  const togglePrivacySetting = (setting) => {
    setUserData((prev) => ({
      ...prev,
      privacySettings: {
        ...prev.privacySettings,
        [setting]: !prev.privacySettings[setting],
      },
    }))
  }

  const contactSupport = () => {
    Alert.alert("Contact Support", "How would you like to contact our support team?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Email",
        onPress: () => {
          const email = "support@hakbangquest.com"
          const subject = "HakbangQuest Support Request"
          const body = `User ID: ${auth.currentUser?.uid || "Not available"}\nEmail: ${userData.email}\n\nPlease describe your issue:`
          Linking.openURL(
            `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
          ).catch((err) => {
            console.error("Could not open email client:", err)
            Alert.alert(
              "Email Error",
              "Could not open email client. Please send an email manually to support@hakbangquest.com",
            )
          })
        },
      },
      {
        text: "Live Chat",
        onPress: () => {
          Alert.alert(
            "Live Chat",
            "Live chat support will be available in the next app update. Would you like to submit a ticket instead?",
            [
              { text: "No", style: "cancel" },
              {
                text: "Yes",
                onPress: () => {
                  Alert.alert("Ticket System", "The ticket system will be available in the next update.")
                },
              },
            ],
          )
        },
      },
      {
        text: "FAQ",
        onPress: () => {
          setShowHelpSupportModal(true)
        },
      },
    ])
  }

  const openFAQ = (faqItem) => {
    Alert.alert(faqItem.question, faqItem.answer, [
      {
        text: "OK",
      },
      {
        text: "More Help",
        onPress: () => contactSupport(),
      },
    ])
  }

  const restorePrivacySettingsFromStorage = async () => {
    try {
      const cachedUserData = await AsyncStorage.getItem("userData")
      if (cachedUserData) {
        const parsedData = safeParseJSON(cachedUserData, {})
        if (parsedData.privacySettings) {
          setUserData((prev) => ({
            ...prev,
            privacySettings: parsedData.privacySettings,
          }))
          return true
        }
      }
      return false
    } catch (err) {
      console.error("Error restoring privacy settings from AsyncStorage:", err)
      return false
    }
  }

  const fetchUserData = async () => {
    setLoading(true)
    setError(null)
    let fetchedUserData = null
    let offlineMode = false

    const user = auth.currentUser
    if (!user) {
      setError("Not authenticated")
      setLoading(false)
      return
    }

    // Try to fetch from AsyncStorage first
    try {
      const cachedUserData = await AsyncStorage.getItem("userData")
      if (cachedUserData) {
        fetchedUserData = safeParseJSON(cachedUserData, null)
        if (fetchedUserData && fetchedUserData.username && fetchedUserData.email) {
          setUserData((prevData) => ({
            ...prevData,
            ...fetchedUserData,
            avatar: fetchedUserData.avatar || prevData.avatar,
            privacySettings: fetchedUserData.privacySettings || prevData.privacySettings,
          }))
          setEditUsername(fetchedUserData.username)
        }
      }
    } catch (cacheErr) {
      console.warn("Error accessing AsyncStorage:", cacheErr)
    }

    // Fetch from Firestore
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid))
      if (userDoc.exists()) {
        fetchedUserData = userDoc.data()
      } else {
        fetchedUserData = {
          username: "User",
          email: user.email,
          avatar: userData.avatar,
          level: 1,
          totalXP: 0,
          totalDistance: 0,
          totalDuration: 0,
          totalReps: 0,
          totalActivities: 0,
          totalSteps: 0,
          totalStrengthDuration: 0,
          friends: [],
          deviceType: "",
          pushToken: "",
          isOnline: false,
          createdAt: new Date(),
          lastSeen: new Date(),
          lastActivityDate: null,
          lastQuestCompleted: null,
        }
        await setDoc(doc(db, "users", user.uid), fetchedUserData)
      }
    } catch (firestoreErr) {
      console.warn("Firestore error, using cached data:", firestoreErr)
      offlineMode = true
      if (!fetchedUserData) {
        setError("Could not retrieve user data. Please check your connection.")
        setLoading(false)
        return
      }
    }

    if (fetchedUserData) {
      // Format timestamps
      const formatTimestamp = (timestamp) => {
        if (!timestamp) return null
        const date = timestamp?.toDate ? timestamp.toDate() : timestamp instanceof Date ? timestamp : null
        return date
      }

      setUserData((prevData) => ({
        ...prevData,
        ...fetchedUserData,
        avatar: fetchedUserData.avatar || prevData.avatar,
        privacySettings: fetchedUserData.privacySettings || prevData.privacySettings,
        createdAt: formatTimestamp(fetchedUserData.createdAt),
        lastSeen: formatTimestamp(fetchedUserData.lastSeen),
        lastActivityDate: formatTimestamp(fetchedUserData.lastActivityDate),
        lastQuestCompleted: formatTimestamp(fetchedUserData.lastQuestCompleted),
      }))
      setEditUsername(fetchedUserData.username || "User")

      // Cache the data
      try {
        await AsyncStorage.setItem("userData", JSON.stringify(fetchedUserData))
      } catch (cacheErr) {
        console.warn("Error caching user data:", cacheErr)
      }
    }

    setLoading(false) // Always set loading to false at the end
  }

  useEffect(() => {
    const init = async () => {
      await fetchUserData();

      const user = auth.currentUser;
      if (user) {
        await fetchRecentActivities(user.uid);
        await fetchBadges(user.uid);
      }
    };

    init();
  }, []);


  const confirmLogout = async () => {
    try {
      // Set logout flag BEFORE signing out
      await AsyncStorage.setItem("isLoggingOut", "true");

      // Clear user state immediately
      setUserData({
        username: "User",
        email: "user@example.com",
        avatar: "https://randomuser.me/api/portraits/men/1.jpg",
        uid: null,
        privacySettings: { showProfile: true, showActivities: true, showStats: true },
        avgDailySteps: 5000,
        avgDailyDistance: 2.5,
        avgActiveDuration: 45,
        avgDailyReps: 20,
        level: 1,
        totalXP: 0,
      });

      // Sign out from Firebase
      await signOut(auth);

      // Clear AsyncStorage
      await AsyncStorage.multiRemove([
        "userSession",
        "userData",
        "privacySettings",
        "lastActiveScreen",
        "activityParams"
      ]);

      // Let App.js handle navigation based on the logout flag
      console.log("Logout completed, App.js will handle navigation to signin");

    } catch (err) {
      console.error("Logout error:", err);
      Alert.alert("Error", "Failed to log out. Please try again.");
    }
  };


  const renderStatItem = (value, label, icon, color) => (
    <View style={twrnc`items-center flex-1 px-2`} key={label}>
      <View style={[twrnc`w-14 h-14 rounded-2xl items-center justify-center mb-3`, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
        {value}
      </CustomText>
      <CustomText style={twrnc`text-gray-400 text-xs text-center`}>{label}</CustomText>
    </View>
  )

  const renderDrawerMenuItem = (item) => {
    if (item.isDivider) {
      return <View key={item.id} style={twrnc`h-px bg-[#3A3F4B] my-6 mx-6`} />
    }

    const IconComponent = item.iconType === "Ionicons" ? Ionicons : FontAwesome

    return (
      <TouchableOpacity
        key={item.id}
        style={twrnc`mx-4 mb-3 p-4 rounded-2xl`}
        onPress={item.action}
        activeOpacity={0.7}
      >
        <View style={twrnc`flex-row items-center`}>
          <View
            style={[twrnc`w-12 h-12 rounded-xl items-center justify-center mr-4`, { backgroundColor: item.bgColor }]}
          >
            <IconComponent name={item.icon} size={20} color={item.color} />
          </View>
          <View style={twrnc`flex-1`}>
            <CustomText weight="semibold" style={twrnc`text-white text-base mb-1`}>
              {item.title}
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-xs`} numberOfLines={1}>
              {item.description}
            </CustomText>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6B7280" />
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center`}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <CustomText style={twrnc`text-white mt-4`}>Loading Profile...</CustomText>
      </View>
    )
  }

  if (error) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center px-5`}>
        <FontAwesome name="exclamation-circle" size={48} color="#EF4444" style={twrnc`mb-4`} />
        <CustomText style={twrnc`text-white text-center mb-4`}>{error}</CustomText>
        <TouchableOpacity
          style={twrnc`bg-[#4361EE] px-4 py-2 rounded-lg`}
          onPress={() => {
            setError(null)
            setLoading(true)
            fetchUserData()
          }}
        >
          <CustomText style={twrnc`text-white`}>Retry</CustomText>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={twrnc`flex-1 bg-[#121826]`}>
      {/* Enhanced Top Navigation Bar */}
      <View style={twrnc`bg-[#1A1F2E] px-4 py-4 flex-row items-center justify-between z-10 shadow-lg`}>
        <TouchableOpacity
          onPress={openDrawer}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`}
        >
          <Ionicons name="menu" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <CustomText weight="bold" style={twrnc`text-white text-xl`}>
          Profile
        </CustomText>

        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`}
          onPress={navigateToDashboard}
        >
          <Ionicons name="home-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView style={twrnc`flex-1`} showsVerticalScrollIndicator={false}>

        {/* Enhanced Profile Section */}
        <View style={twrnc`px-5 pt-8 pb-6 items-center`}>
          <TouchableOpacity onPress={selectImage} style={twrnc`mb-6 relative`}>
            <Image
              source={{ uri: userData.avatar }}
              style={twrnc`w-24 h-24 rounded-full border-4 border-[#4361EE]`}
            />
            <View style={twrnc`absolute -bottom-1 -right-1 bg-[#4361EE] rounded-full p-2`}>
              <Ionicons name="camera" size={16} color="white" />
            </View>
          </TouchableOpacity>

          <CustomText weight="bold" style={twrnc`text-white text-3xl mb-2`}>
            {userData.username}
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-base mb-2`}>
            {userData.email}
          </CustomText>

          <View style={twrnc`flex-row items-center mb-4`}>
            <CustomText style={twrnc`text-[#4361EE] text-lg font-bold mr-4`}>
              Level {userData.level}
            </CustomText>
            <CustomText style={twrnc`text-[#FFC107] text-lg font-bold`}>
              {userData.totalXP.toLocaleString()} XP
            </CustomText>
          </View>

          {/* Enhanced Stats Grid */}
          <View style={twrnc`w-full px-4 mb-4`}>
            <View style={twrnc`flex-row justify-between mb-3`}>
              {renderStatItem(
                `${(userData.totalDistance || 0).toFixed(2)} km`,
                "Total Distance",
                "map-outline",
                "#4361EE",
              )}
              {renderStatItem(
                `${userData.totalActivities || 0}`,
                "Activities",
                "fitness-outline",
                "#06D6A0"
              )}
              {renderStatItem(
                `${Math.round((userData.totalDuration || 0) / 60)} min`,
                "Total Time",
                "time-outline",
                "#FFC107"
              )}
            </View>
            <View style={twrnc`flex-row justify-between`}>
              {renderStatItem(
                `${userData.totalReps || 0}`,
                "Total Reps",
                "barbell-outline",
                "#FF6B6B"
              )}
              {renderStatItem(
                `${userData.totalSteps || 0}`,
                "Steps",
                "walk-outline",
                "#9B59B6"
              )}
              {renderStatItem(
                `${userData.friends?.length || 0}`,
                "Friends",
                "people-outline",
                "#06D6A0"
              )}
            </View>
          </View>
        </View>
        {/* 🔹 End Profile Header */}

        {/* Enhanced Badges Section */}
        <View style={twrnc`px-5 mt-8 mb-6`}>
          <View style={twrnc`flex-row justify-between items-center mb-6`}>
            <View style={twrnc`flex-row items-center`}>
              <Ionicons name="trophy" size={20} color="#FFC107" style={twrnc`mr-2`} />
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Badges ({badges.length})
              </CustomText>
            </View>
            {badges.length > 0 && (
              <TouchableOpacity onPress={handleViewAllBadges}>
                <CustomText style={twrnc`text-[#4361EE] font-medium`}>See All</CustomText>
              </TouchableOpacity>
            )}
          </View>

          {badges.length > 0 ? (
            <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-4`}>
              <BadgeGrid
                badges={badges.slice(0, 6)}
                onBadgePress={handleBadgePress}
                maxVisible={6}
              />
            </View>
          ) : (
            <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-6 items-center`}>
              <Ionicons
                name="ribbon-outline"
                size={40}
                color="#4361EE"
                style={twrnc`mb-3 opacity-50`}
              />
              <CustomText style={twrnc`text-gray-400 text-center`}>
                Complete activities and challenges to earn badges
              </CustomText>
            </View>
          )}
        </View>

        {/* Simplified Account Info Section */}
        <View style={twrnc`px-5 mb-8`}>
          <View style={twrnc`w-full bg-[#2A2E3A] rounded-2xl p-4`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mb-3`}>
              Account Info
            </CustomText>
            <View style={twrnc`space-y-2`}>
              <View style={twrnc`flex-row justify-between items-center mb-2`}>
                <CustomText style={twrnc`text-gray-400`}>Joined</CustomText>
                <CustomText style={twrnc`text-white`}>
                  {formatTimestamp(userData.createdAt)}
                </CustomText>
              </View>
              <View style={twrnc`flex-row justify-between items-center`}>
                <CustomText style={twrnc`text-gray-400`}>Last Activity</CustomText>
                <CustomText style={twrnc`text-white`}>
                  {formatTimestamp(userData.lastActivityDate)}
                </CustomText>
              </View>
            </View>
          </View>
        </View>

        {/* Enhanced Recent Activities Section */}
        <View style={twrnc`px-5 mb-20`}>
          <View style={twrnc`flex-row justify-between items-center mb-6`}>
            <View style={twrnc`flex-row items-center`}>
              <Ionicons name="time" size={20} color="#06D6A0" style={twrnc`mr-2`} />
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Recent Activities
              </CustomText>
            </View>
            {recentActivities.length > 0 && (
              <TouchableOpacity
                style={twrnc`flex-row items-center`}
                onPress={() => setShowAllActivities(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <CustomText style={twrnc`text-[#4361EE] font-medium`}>See All</CustomText>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="#4361EE"
                  style={twrnc`ml-1`}
                />
              </TouchableOpacity>
            )}
          </View>

          {recentActivities.length > 0 ? (
            <View>
              {recentActivities.slice(0, 3).map((activity, index) => (
                <View
                  key={index}
                  style={twrnc`flex-row items-center justify-between py-3 border-b border-gray-100`}
                >
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`w-10 h-10 rounded-full bg-[#4361EE] items-center justify-center mr-3`}>
                      <Ionicons
                        name={getActivityIcon(activity.activityType)}
                        size={20}
                        color="white"
                      />
                    </View>
                    <View style={twrnc`flex-1`}>
                      <CustomText style={twrnc`font-medium text-gray-900`}>
                        {activity.activityType || (
                          <CustomText>Unknown Activity</CustomText>
                        )}
                      </CustomText>
                      <View style={twrnc`flex-row items-center mt-1`}>
                        {activity.distance ? (
                          <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                            {(activity.distance / 1000).toFixed(2)} km
                          </CustomText>
                        ) : null}
                        {activity.duration ? (
                          <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                            {Math.round(activity.duration / 60)} min
                          </CustomText>
                        ) : null}
                        {activity.reps ? (
                          <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                            {activity.reps} reps
                          </CustomText>
                        ) : null}
                        {activity.questTitle ? (
                          <View style={twrnc`bg-[#4361EE] px-2 py-1 rounded-full`}>
                            <CustomText style={twrnc`text-white text-xs font-medium`}>
                              Quest
                            </CustomText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={twrnc`items-end`}>
                      <CustomText style={twrnc`text-gray-500 text-xs`}>
                        {activity.createdAt?.toDate
                          ? activity.createdAt.toDate().toLocaleDateString()
                          : new Date().toLocaleDateString()}
                      </CustomText>
                      {activity.calories ? (
                        <CustomText style={twrnc`text-[#FFC107] text-xs font-medium mt-1`}>
                          {activity.calories} cal
                        </CustomText>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-6 items-center`}>
              <Ionicons
                name="fitness-outline"
                size={40}
                color="#06D6A0"
                style={twrnc`mb-3 opacity-50`}
              />
              <CustomText style={twrnc`text-gray-400 text-center`}>
                Start tracking activities to see your recent workouts here
              </CustomText>
            </View>
          )}
        </View>

      </ScrollView>


      {/* Enhanced Drawer Menu */}
      {isDrawerOpen && (
        <TouchableOpacity
          style={twrnc`absolute top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 z-20`}
          activeOpacity={1}
          onPress={closeDrawer}
        />
      )}

      <Animated.View
        style={[
          twrnc`absolute top-0 left-0 bottom-0 bg-[#1A1F2E] z-30 w-4/5 shadow-2xl`,
          {
            transform: [{ translateX: drawerAnimation }],
          },
        ]}
      >
        {/* Enhanced Drawer Header */}
        <View style={twrnc`pt-16 pb-8 px-6 bg-gradient-to-b from-[#2A2E3A] to-[#1A1F2E] border-b border-[#3A3F4B]`}>
          <View style={twrnc`flex-row items-center`}>
            <Image
              source={{ uri: userData.avatar }}
              style={twrnc`w-16 h-16 rounded-2xl mr-4 border-2 border-[#4361EE]`}
              defaultSource={{ uri: "https://randomuser.me/api/portraits/men/1.jpg" }}
            />
            <View style={twrnc`flex-1`}>
              <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
                {userData.username}
              </CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm`} numberOfLines={1}>
                {userData.email}
              </CustomText>
            </View>
          </View>
        </View>

        {/* Enhanced Menu Items */}
        <ScrollView style={twrnc`flex-1 pt-6`} showsVerticalScrollIndicator={false}>
          {drawerMenuItems.map(renderDrawerMenuItem)}
        </ScrollView>

        {/* Enhanced Footer */}
        <View style={twrnc`p-6 border-t border-[#3A3F4B] bg-[#2A2E3A]`}>
          <CustomText style={twrnc`text-gray-400 text-xs text-center`}>HakbangQuest v1.0.0</CustomText>
        </View>
      </Animated.View>

      {/* All Modals */}
      <CustomModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        icon="sign-out"
        title="Confirm Logout"
        message="Are you sure you want to log out? Your progress will be saved automatically."
        type="warning"
      />

      {/* Edit Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showEditProfileModal}
        onRequestClose={() => setShowEditProfileModal(false)}
      >
        <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
          <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Edit Profile
              </CustomText>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                onPress={() => setShowEditProfileModal(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText style={twrnc`text-white mb-3 font-medium`}>Username</CustomText>
                <TextInput
                  style={twrnc`bg-[#3A3F4B] text-white p-4 rounded-xl mb-4 text-base`}
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#9CA3AF"
                />
                <CustomText style={twrnc`text-gray-400 text-xs mb-4`}>
                  Username must be at least 3 characters and can only contain letters, numbers, and underscores.
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#4361EE] p-4 rounded-xl items-center`}
                  onPress={saveUsername}
                  disabled={savingUsername}
                >
                  {savingUsername ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <CustomText weight="semibold" style={twrnc`text-white`}>
                      Save Changes
                    </CustomText>
                  )}
                </TouchableOpacity>
              </View>

              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-4`}>
                  Profile Picture
                </CustomText>
                <View style={twrnc`items-center mb-4`}>
                  <Image
                    source={{ uri: userData.avatar }}
                    style={twrnc`w-24 h-24 rounded-2xl mb-4`}
                    defaultSource={{ uri: "https://randomuser.me/api/portraits/men/1.jpg" }}
                  />
                  <TouchableOpacity
                    style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl`}
                    onPress={selectImage}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <CustomText style={twrnc`text-white font-medium`}>Change Picture</CustomText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Help & Support Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showHelpSupportModal}
        onRequestClose={() => setShowHelpSupportModal(false)}
      >
        <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
          <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Help & Support
              </CustomText>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                onPress={() => setShowHelpSupportModal(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-4`}>
                  Frequently Asked Questions
                </CustomText>
                {faqItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={twrnc`mb-3 py-4 border-b border-[#3A3F4B]`}
                    onPress={() => openFAQ(item)}
                  >
                    <View style={twrnc`flex-row items-center justify-between`}>
                      <CustomText style={twrnc`text-[#4CC9F0] flex-1 mr-2 font-medium`}>{item.question}</CustomText>
                      <Ionicons name="chevron-forward" size={16} color="#4CC9F0" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Contact Support
                </CustomText>
                <CustomText style={twrnc`text-gray-300 mb-4`}>
                  Need help with something specific? Our support team is here to help.
                </CustomText>
                <TouchableOpacity style={twrnc`bg-[#4CC9F0] p-4 rounded-xl items-center`} onPress={contactSupport}>
                  <CustomText weight="semibold" style={twrnc`text-white`}>
                    Contact Support
                  </CustomText>
                </TouchableOpacity>
              </View>

              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  App Information
                </CustomText>
                <View style={twrnc`flex-row justify-between mb-2`}>
                  <CustomText style={twrnc`text-gray-400`}>Version</CustomText>
                  <CustomText style={twrnc`text-white`}>1.0.0</CustomText>
                </View>
                <View style={twrnc`flex-row justify-between`}>
                  <CustomText style={twrnc`text-gray-400`}>Build</CustomText>
                  <CustomText style={twrnc`text-white`}>May 19, 2025</CustomText>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy Settings Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPrivacySettingsModal}
        onRequestClose={() => setShowPrivacySettingsModal(false)}
      >
        <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
          <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Privacy Settings
              </CustomText>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                onPress={() => setShowPrivacySettingsModal(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-6`}>
                  Profile Visibility
                </CustomText>
                {[
                  {
                    key: "showProfile",
                    title: "Show Profile to Others",
                    description: "Allow other users to view your profile information",
                  },
                  {
                    key: "showActivities",
                    title: "Show Activities to Others",
                    description: "Allow other users to see your activity history",
                  },
                  {
                    key: "showStats",
                    title: "Show Stats to Others",
                    description: "Allow other users to view your fitness statistics",
                  },
                ].map((setting, index) => (
                  <TouchableOpacity
                    key={setting.key}
                    style={twrnc`flex-row items-center justify-between mb-6`}
                    onPress={() => togglePrivacySetting(setting.key)}
                  >
                    <View style={twrnc`flex-1 mr-4`}>
                      <CustomText style={twrnc`text-white mb-1 font-medium`}>{setting.title}</CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>{setting.description}</CustomText>
                    </View>
                    <View
                      style={twrnc`w-14 h-8 rounded-full ${userData.privacySettings[setting.key] ? "bg-green-500" : "bg-gray-600"
                        } items-center justify-center`}
                    >
                      <View
                        style={twrnc`absolute ${userData.privacySettings[setting.key] ? "right-1" : "left-1"
                          } w-6 h-6 bg-white rounded-full shadow-lg`}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={twrnc`bg-[#9C27B0] p-4 rounded-xl items-center mb-4`}
                onPress={savePrivacySettings}
                disabled={savingPrivacySettings}
              >
                {savingPrivacySettings ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <CustomText weight="semibold" style={twrnc`text-white`}>
                    Save Privacy Settings
                  </CustomText>
                )}
              </TouchableOpacity>

              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Data & Privacy
                </CustomText>
                <CustomText style={twrnc`text-gray-400 mb-4`}>
                  We value your privacy. Your data is stored securely and is only used to provide you with the best
                  experience.
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#3A3F4B] p-4 rounded-xl items-center mb-3`}
                  onPress={() => Alert.alert("Privacy Policy", "The privacy policy will open in your browser.")}
                >
                  <CustomText style={twrnc`text-white font-medium`}>View Privacy Policy</CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twrnc`bg-[#3A3F4B] p-4 rounded-xl items-center`}
                  onPress={() =>
                    Alert.alert("Data Request", "You can request a copy of your data by contacting support.")
                  }
                >
                  <CustomText style={twrnc`text-white font-medium`}>Request My Data</CustomText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Badge Detail Modal */}
      <BadgeModal visible={isBadgeModalVisible} badge={selectedBadge} onClose={() => setIsBadgeModalVisible(false)} />

      {/* All Badges Modal */}
      <AllBadgesModal
        visible={isAllBadgesModalVisible}
        badges={badges}
        onClose={() => setIsAllBadgesModalVisible(false)}
        onBadgePress={handleBadgePress}
      />

      {showAllActivities && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showAllActivities}
          onRequestClose={() => setShowAllActivities(false)}
        >
          <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
            <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
              {/* Header */}
              <View style={twrnc`flex-row justify-between items-center mb-6`}>
                <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                  All Activities
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                  onPress={() => setShowAllActivities(false)}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Activities List */}
              <FlatList
                data={recentActivities}
                keyExtractor={(item, index) => index.toString()}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: activity }) => (
                  <View
                    style={twrnc`flex-row items-center justify-between py-4 px-4 mb-3 rounded-2xl bg-[#2A2E3A]`}
                  >
                    <View style={twrnc`flex-row items-center flex-1`}>
                      <View
                        style={twrnc`w-10 h-10 rounded-full bg-[#4361EE] items-center justify-center mr-3`}
                      >
                        <Ionicons
                          name={getActivityIcon(activity.activityType)}
                          size={20}
                          color="white"
                        />
                      </View>
                      <View style={twrnc`flex-1`}>
                        <CustomText style={twrnc`font-medium text-white`}>
                          {activity.activityType || (
                            <CustomText>Unknown Activity</CustomText>
                          )}
                        </CustomText>
                        <View style={twrnc`flex-row items-center mt-1`}>
                          {activity.distance ? (
                            <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                              {(activity.distance / 1000).toFixed(2)} km
                            </CustomText>
                          ) : null}
                          {activity.duration ? (
                            <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                              {Math.round(activity.duration / 60)} min
                            </CustomText>
                          ) : null}
                          {activity.reps ? (
                            <CustomText style={twrnc`text-gray-400 text-sm mr-4`}>
                              {activity.reps} reps
                            </CustomText>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <View style={twrnc`items-end`}>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>
                        {activity.createdAt?.toDate
                          ? activity.createdAt.toDate().toLocaleDateString()
                          : new Date().toLocaleDateString()}
                      </CustomText>
                      {activity.calories ? (
                        <CustomText
                          style={twrnc`text-[#FFC107] text-xs font-medium mt-1`}
                        >
                          {activity.calories} cal
                        </CustomText>
                      ) : null}
                    </View>
                  </View>
                )}
              />
            </View>
          </View>
        </Modal>
      )}

    </View>
  )
}

export default ProfileScreen

// FileName: ProfileScreen.js
"use client"

import { useState, useEffect, useRef } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  Animated,
  Dimensions,
  Easing,
  Linking, // ✅ ADDED: Required to open the email app
} from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { FontAwesome, Ionicons } from "@expo/vector-icons"
import { auth, db } from "../firebaseConfig"
import { signOut } from "firebase/auth"
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore"
import * as ImagePicker from "expo-image-picker"
import axios from "axios"
import CustomModal from "../components/CustomModal"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { BadgeGrid, BadgeModal, AllBadgesModal } from "../components/BadgeComponents"

const { width } = Dimensions.get("window")

const safeParseJSON = (str, defaultValue) => {
  try {
    return str ? JSON.parse(str) : defaultValue
  } catch (error) {
    console.error("JSON parse error:", error)
    return defaultValue
  }
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return "N/A"
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp instanceof Date ? timestamp : null
  return date ? date.toLocaleDateString() : "N/A"
}

const ProfileScreen = ({ navigateToDashboard, navigateToLanding, navigateToSignIn, updateUserData }) => {
  // Drawer animation
  const drawerAnimation = useRef(new Animated.Value(width)).current
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Modal states
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showEditProfileModal, setShowEditProfileModal] = useState(false)
  const [showHelpSupportModal, setShowHelpSupportModal] = useState(false)
  const [showPrivacySettingsModal, setShowPrivacySettingsModal] = useState(false)

  const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false)

  const [expandedFaqId, setExpandedFaqId] = useState(null);

  // CustomModal states
  const [modalVisible, setModalVisible] = useState(false)
  const [modalProps, setModalProps] = useState({
    title: "Notice",
    message: "",
    type: "info",
    confirmText: "OK",
    showCancelButton: false,
    onConfirm: () => setModalVisible(false),
    onCancel: () => setModalVisible(false),
  })

  // Badge System States
  const [badges, setBadges] = useState([])
  const [selectedBadge, setSelectedBadge] = useState(null)
  const [isBadgeModalVisible, setIsBadgeModalVisible] = useState(false)
  const [isAllBadgesModalVisible, setIsAllBadgesModalVisible] = useState(false)

  // Animation refs
  const headerFadeAnim = useRef(new Animated.Value(0)).current
  const headerSlideAnim = useRef(new Animated.Value(-50)).current
  const cardFadeAnim = useRef(new Animated.Value(0)).current
  const cardSlideAnim = useRef(new Animated.Value(50)).current
  const patternAnim = useRef(new Animated.Value(0)).current

  // Form states
  const [editUsername, setEditUsername] = useState("")

  // User data
  const [userData, setUserData] = useState({
    username: "User",
    email: "user@example.com",
    avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
    level: 1,
    totalXP: 0,
    totalDistance: 0,
    totalDuration: 0,
    totalReps: 0,
    totalActivities: 0,
    totalStrengthDuration: 0,
    friends: [],
    deviceType: "",
    pushToken: "",
    isOnline: false,
    createdAt: null,
    lastSeen: null,
    lastActivityDate: null,
    lastQuestCompleted: null,
    privacySettings: {
      showProfile: true,
      showActivities: true,
      showStats: true,
    },
  })

  // Loading states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingPrivacySettings, setSavingPrivacySettings] = useState(false)

  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dljywnlvh/image/upload"
  const CLOUDINARY_UPLOAD_PRESET = "profile"

  // Animation on mount
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
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(cardSlideAnim, {
        toValue: 0,
        duration: 600,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    Animated.loop(
      Animated.timing(patternAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [])

  const patternRotation = patternAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  })

  // Helper function to show modal
  const showModal = ({
    title = "Notice",
    message = "",
    type = "info",
    confirmText = "OK",
    showCancelButton = false,
    onConfirm,
    onCancel,
    buttons,
  }) => {
    setModalProps({
      title,
      message,
      type,
      confirmText,
      showCancelButton,
      buttons,
      onConfirm: onConfirm || (() => setModalVisible(false)),
      onCancel: onCancel || (() => setModalVisible(false)),
    })
    setModalVisible(true)
  }

  // FAQ content for Help & Support
  const faqItems = [
    {
      id: 1,
      question: "How do I track my activities?",
      answer:
        "To track your activities, go to the Dashboard and tap the 'Start Activity' button. Choose your activity type and tap 'Start'. The app will track your route, distance, and duration automatically.",
    },
    {
      id: 2,
      question: "How do I earn badges?",
      answer:
        "Badges are earned by completing specific achievements. For example, complete your first 5km run to earn the '5K Runner' badge. Check the Achievements section to see what you need to do to earn each badge.",
    },
    {
      id: 3,
      question: "How can I reset my password?",
      answer:
        "To reset your password, go to the Login screen and tap 'Forgot Password'. Enter your email address and follow the instructions sent to your email.",
    },
  ]

  // Enhanced drawer menu items
  const drawerMenuItems = [
    {
      id: "editprofile",
      title: "Edit Profile",
      description: "Update your personal information",
      icon: "person-outline",
      iconType: "Ionicons",
      color: "#4361EE",
      bgColor: "#4361EE20",
      action: () => {
        closeDrawer()
        setTimeout(() => setShowEditProfileModal(true), 300)
      },
    },
    {
      id: "helpsupport",
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
      id: "privacysettings",
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

  // Fetch badges from userbadges
  const fetchBadges = async (userId) => {
    try {
      const userBadgesRef = doc(db, "user_badges", userId)
      const snapshot = await getDoc(userBadgesRef)

      if (snapshot.exists()) {
        const data = snapshot.data()
        const badgeList = data.badges || []
        setBadges(badgeList)
      } else {
        setBadges([])
      }
    } catch (error) {
      console.error("Error fetching badges:", error)
      setBadges([])
    }
  }

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
      toValue: width,
      duration: 300,
      useNativeDriver: true,
    }).start()
    setIsDrawerOpen(false)
  }

  const selectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permissionResult.granted) {
        showModal({
          title: "Permission Denied",
          message: "Please grant access to your photo library to select an image.",
          type: "warning",
        })
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (result.canceled) {
        return
      }

      const uri = result.assets[0].uri
      const mimeType = result.assets[0].mimeType || "image/jpeg"
      await uploadImage(uri, mimeType)
    } catch (err) {
      console.error("Image picker error:", err.message, err.stack)
      showModal({
        title: "Error",
        message: "Failed to pick image. Please try again.",
        type: "error",
      })
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
        throw new Error("No secure_url in Cloudinary response")
      }

      const imageUrl = response.data.secure_url
      await saveImageUrlToFirestore(imageUrl)
      setUserData((prev) => ({ ...prev, avatar: imageUrl }))
      showModal({
        title: "Success",
        message: "Profile picture updated successfully!",
        type: "success",
      })

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
      showModal({
        title: "Error",
        message: `Failed to upload image. ${err.response?.data?.error?.message || ""} Please check your network and try again.`,
        type: "error",
      })
    } finally {
      setUploading(false)
    }
  }

  const saveImageUrlToFirestore = async (imageUrl) => {
    try {
      const user = auth.currentUser
      if (!user) throw new Error("Not authenticated")

      const userRef = doc(db, "users", user.uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        await updateDoc(userRef, { avatar: imageUrl })
      } else {
        await setDoc(userRef, {
          avatar: imageUrl,
          username: userData.username || "User",
          email: user.email,
        })
      }
    } catch (err) {
      console.error("Firestore update error:", err)
      throw err
    }
  }

  const saveUsername = async () => {
    const newUsername = editUsername.trim()

    if (!newUsername) {
      showModal({
        title: "Error",
        message: "Username cannot be empty",
        type: "error",
      })
      return
    }

    if (newUsername.length < 3) {
      showModal({
        title: "Error",
        message: "Username must be at least 3 characters long",
        type: "error",
      })
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      showModal({
        title: "Error",
        message: "Username can only contain letters, numbers, and underscores",
        type: "error",
      })
      return
    }

    if (newUsername === userData.username) {
      setShowEditProfileModal(false)
      return
    }

    setSavingUsername(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error("Not authenticated")

      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, { username: newUsername })

      setUserData((prev) => ({ ...prev, username: newUsername }))
      updateUserData({ username: newUsername })
      setShowEditProfileModal(false)

      showModal({
        title: "Success",
        message: "Username updated successfully!",
        type: "success",
      })

      try {
        const cachedUserData = await AsyncStorage.getItem("userData")
        if (cachedUserData) {
          const parsedData = safeParseJSON(cachedUserData, {})
          parsedData.username = newUsername
          await AsyncStorage.setItem("userData", JSON.stringify(parsedData))
        }
      } catch (storageErr) {
        console.warn("Could not update username in AsyncStorage:", storageErr)
      }
    } catch (err) {
      console.error("Error updating username:", err)
      showModal({
        title: "Error",
        message: "Failed to update username. Please try again.",
        type: "error",
      })
    } finally {
      setSavingUsername(false)
    }
  }

  const savePrivacySettings = async () => {
    setSavingPrivacySettings(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error("Not authenticated")

      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, {
        privacySettings: userData.privacySettings,
      })

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
      showModal({
        title: "Success",
        message: "Privacy settings updated successfully!",
        type: "success",
      })
    } catch (err) {
      console.error("Error updating privacy settings:", err)
      showModal({
        title: "Error",
        message: "Failed to update privacy settings. Please try again.",
        type: "error",
      })
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

  // ✅ UPDATED: Contact Support function with Linking
  const contactSupport = () => {
    showModal({
      title: "Contact Support",
      message: "How would you like to contact our support team?",
      type: "info",
      buttons: [
        {
          label: "Cancel",
          style: "secondary",
          action: () => true,
        },
        {
          label: "Email",
          style: "primary",
          action: () => {
            const email = "hakbang.quest.g7@gmail.com";
            const subject = "Help Needed - HakbangQuest";
            const body = `Hello Support Team,\n\nI am contacting you regarding...`;

            // Construct mailto link
            const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

            Linking.openURL(url).catch(err => {
              console.error("Could not open mail app", err);
              // Fallback if mail app fails to open
              showModal({
                title: "Email Support",
                message: `Please manually email us at ${email}`,
                type: "info",
              });
            });

            return true;
          },
        },
      ],
    })
  }

  // ✅ 1. Handle Opening Privacy Policy
  const handleOpenPrivacyPolicy = () => {
    setShowPrivacyPolicyModal(true);
  };

  // ✅ 2. Handle Requesting Data (GDPR/Compliance)
  const handleRequestData = () => {
    const supportEmail = "hakbang.quest.g7@gmail.com";
    const subject = `Data Export Request - ${userData.username}`;
    const body = `Hello Support Team,

I would like to request a copy of all personal data associated with my account.

User Details:
- Username: ${userData.username}
- User ID: ${auth.currentUser?.uid || "N/A"}
- Email: ${userData.email}

Please let me know the next steps.

Thank you.`;

    // Create the mailto link
    const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    Linking.openURL(url).catch((err) => {
      console.error("Could not open mail app", err);
      // Fallback if no mail app is installed
      showModal({
        title: "Request Data",
        message: `Please email us directly at ${supportEmail} to request your data copy.`,
        type: "info",
      });
    });
  };

  const toggleFaq = (id) => {
    setExpandedFaqId(expandedFaqId === id ? null : id);
  }

  const fetchUserData = async () => {
    setLoading(true)
    setError(null)
    let fetchedUserData = null

    const user = auth.currentUser
    if (!user) {
      setError("Not authenticated")
      setLoading(false)
      return
    }

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
          totalStrengthDuration: 0,
          friends: [],
          deviceType: "",
          pushToken: "",
          isOnline: false,
          createdAt: new Date(),
          lastSeen: new Date(),
          lastActivityDate: null,
          lastQuestCompleted: null,
          privacySettings: {
            showProfile: true,
            showActivities: true,
            showStats: true,
          },
        }
        await setDoc(doc(db, "users", user.uid), fetchedUserData)
      }
    } catch (firestoreErr) {
      console.warn("Firestore error:", firestoreErr)
      if (!fetchedUserData) {
        setError("Could not retrieve user data. Please check your connection.")
        setLoading(false)
        return
      }
    }

    if (fetchedUserData) {
      const formatTimestampHelper = (timestamp) => {
        if (!timestamp) return null
        const date = timestamp?.toDate ? timestamp.toDate() : timestamp instanceof Date ? timestamp : null
        return date
      }

      setUserData((prevData) => ({
        ...prevData,
        ...fetchedUserData,
        avatar: fetchedUserData.avatar || prevData.avatar,
        privacySettings: fetchedUserData.privacySettings || prevData.privacySettings,
        createdAt: formatTimestampHelper(fetchedUserData.createdAt),
        lastSeen: formatTimestampHelper(fetchedUserData.lastSeen),
        lastActivityDate: formatTimestampHelper(fetchedUserData.lastActivityDate),
        lastQuestCompleted: formatTimestampHelper(fetchedUserData.lastQuestCompleted),
      }))
      setEditUsername(fetchedUserData.username || "User")

      try {
        await AsyncStorage.setItem("userData", JSON.stringify(fetchedUserData))
      } catch (cacheErr) {
        console.warn("Error caching user data:", cacheErr)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      await fetchUserData()
      const user = auth.currentUser
      if (user) {
        await fetchBadges(user.uid)
      }
    }
    init()
  }, [])

  const confirmLogout = async () => {
    try {
      await AsyncStorage.setItem("isLoggingOut", "true")

      setUserData({
        username: "User",
        email: "user@example.com",
        avatar: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
        uid: null,
        privacySettings: {
          showProfile: true,
          showActivities: true,
          showStats: true,
        },
        avgDailyDistance: 2.5,
        avgActiveDuration: 45,
        avgDailyReps: 20,
        level: 1,
        totalXP: 0,
      })

      await signOut(auth)
      await AsyncStorage.multiRemove(["userSession", "userData", "privacySettings", "lastActiveScreen", "activityParams"])
    } catch (err) {
      console.error("Logout error:", err)
      showModal({
        title: "Error",
        message: "Failed to log out. Please try again.",
        type: "error",
      })
    }
  }

  const renderDrawerMenuItem = (item) => {
    if (item.isDivider) {
      return <View key={item.id} style={twrnc`h-px bg-gray-700 my-2 mx-4`} />
    }

    const IconComponent = item.iconType === "Ionicons" ? Ionicons : FontAwesome

    return (
      <TouchableOpacity
        key={item.id}
        style={twrnc`flex-row items-center px-5 py-3.5 mx-3 mb-2 rounded-xl`}
        onPress={item.action}
        activeOpacity={0.7}
      >
        <View style={[twrnc`w-10 h-10 rounded-xl items-center justify-center mr-3`, { backgroundColor: item.bgColor }]}>
          <IconComponent name={item.icon} size={20} color={item.color} />
        </View>
        <View style={twrnc`flex-1`}>
          <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
            {item.title}
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-[10px]`}>{item.description}</CustomText>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6B7280" />
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={twrnc`flex-1 bg-[#0f172a] justify-center items-center`}>
        <ActivityIndicator size="large" color="#4361EE" />
        <CustomText style={twrnc`text-white mt-4 text-sm`}>Loading Profile...</CustomText>
      </View>
    )
  }

  if (error) {
    return (
      <View style={twrnc`flex-1 bg-[#0f172a] justify-center items-center px-6`}>
        <View style={twrnc`bg-[#1e293b] rounded-2xl p-6 items-center w-full max-w-sm`}>
          <View style={twrnc`bg-[#EF476F] bg-opacity-20 rounded-full p-4 mb-4`}>
            <Ionicons name="alert-circle" size={32} color="#EF476F" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-base mb-2 text-center`}>
            Something went wrong
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-xs text-center mb-6`}>{error}</CustomText>
          <TouchableOpacity
            style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl w-full`}
            onPress={() => {
              setError(null)
              setLoading(true)
              fetchUserData()
            }}
          >
            <CustomText weight="bold" style={twrnc`text-white text-center text-sm`}>
              Retry
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      <ScrollView style={twrnc`flex-1`} contentContainerStyle={twrnc`pb-20`} showsVerticalScrollIndicator={false}>
        {/* ===== HEADER SECTION ===== */}
        <Animated.View
          style={[
            twrnc`px-5 pt-10 pb-6 relative overflow-hidden`,
            {
              backgroundColor: "#1e293b",
              opacity: headerFadeAnim,
              transform: [{ translateY: headerSlideAnim }],
            },
          ]}
        >
          {/* Decorative Pattern */}
          <Animated.View
            style={[
              twrnc`absolute top-0 right-0 w-32 h-32`,
              {
                opacity: 0.08,
                transform: [{ rotate: patternRotation }],
              },
            ]}
          >
            <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
              {[...Array(16)].map((_, i) => (
                <View key={i} style={[twrnc`w-1/4 h-1/4 border border-indigo-400`, { transform: [{ rotate: "45deg" }] }]} />
              ))}
            </View>
          </Animated.View>

          {/* Header Content */}
          <View style={twrnc`relative z-10`}>
            {/* Top Bar */}
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-6 bg-[#FFC107] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                  Profile
                </CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={openDrawer} activeOpacity={0.7}>
                <Ionicons name="menu" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Profile Card */}
            <View style={twrnc`flex-row items-center`}>
              <View style={twrnc`relative mr-4`}>
                {uploading ? (
                  <View style={twrnc`w-20 h-20 rounded-full bg-[#0f172a] items-center justify-center border-2 border-[#4361EE]`}>
                    <ActivityIndicator size="small" color="#4361EE" />
                  </View>
                ) : (
                  <>
                    <Image
                      source={{ uri: userData.avatar }}
                      style={twrnc`w-20 h-20 rounded-full border-2 border-[#4361EE]`}
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      style={twrnc`absolute bottom-0 right-0 bg-[#4361EE] rounded-full p-1.5`}
                      onPress={selectImage}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera" size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <View style={twrnc`flex-1`}>
                <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
                  {userData.username}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs mb-2`}>{userData.email}</CustomText>

                <View style={twrnc`flex-row items-center flex-wrap`}>
                  <View style={twrnc`bg-[#4361EE] rounded-full px-2.5 py-1 mr-2 mb-1`}>
                    <View style={twrnc`flex-row items-center`}>
                      <Ionicons name="trophy" size={10} color="white" style={twrnc`mr-1`} />
                      <CustomText weight="bold" style={twrnc`text-white text-[10px]`}>
                        Lvl {userData.level}
                      </CustomText>
                    </View>
                  </View>
                  <View style={twrnc`bg-[#FFC107] rounded-full px-2.5 py-1 mb-1`}>
                    <View style={twrnc`flex-row items-center`}>
                      <Ionicons name="star" size={10} color="#0f172a" style={twrnc`mr-1`} />
                      <CustomText weight="bold" style={twrnc`text-[#0f172a] text-[10px]`}>
                        {userData.totalXP.toLocaleString()} XP
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ===== MAIN CONTENT ===== */}
        <Animated.View
          style={[
            twrnc`px-5`,
            {
              opacity: cardFadeAnim,
              transform: [{ translateY: cardSlideAnim }],
            },
          ]}
        >
          <View style={twrnc`h-4`} />

          {/* ===== STATS GRID ===== */}
          <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5 overflow-hidden relative`}>
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
                <View style={twrnc`w-0.5 h-4 bg-[#06D6A0] rounded-full mr-2`} />
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Your Stats
                </CustomText>
              </View>

              <View style={twrnc`flex-row flex-wrap -mx-1`}>
                <View style={twrnc`w-1/3 px-1 mb-3`}>
                  <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                    <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-full p-2 mb-2`}>
                      <Ionicons name="map-outline" size={18} color="#4361EE" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {(userData.totalDistance || 0).toFixed(1)}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[9px]`}>km</CustomText>
                  </View>
                </View>

                <View style={twrnc`w-1/3 px-1 mb-3`}>
                  <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                    <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-full p-2 mb-2`}>
                      <Ionicons name="fitness-outline" size={18} color="#06D6A0" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {userData.totalActivities || 0}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[9px]`}>Activities</CustomText>
                  </View>
                </View>

                <View style={twrnc`w-1/3 px-1 mb-3`}>
                  <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                    <View style={twrnc`bg-[#FFC107] bg-opacity-20 rounded-full p-2 mb-2`}>
                      <Ionicons name="time-outline" size={18} color="#FFC107" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {Math.round((userData.totalDuration || 0) / 60)}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[9px]`}>Minutes</CustomText>
                  </View>
                </View>

                <View style={twrnc`w-1/3 px-1`}>
                  <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                    <View style={twrnc`bg-[#FF6B6B] bg-opacity-20 rounded-full p-2 mb-2`}>
                      <Ionicons name="barbell-outline" size={18} color="#FF6B6B" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {userData.totalReps || 0}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[9px]`}>Reps</CustomText>
                  </View>
                </View>

                <View style={twrnc`w-1/3 px-1`}>
                  <View style={twrnc`bg-[#0f172a] rounded-xl p-3 items-center`}>
                    <View style={twrnc`bg-[#9C27B0] bg-opacity-20 rounded-full p-2 mb-2`}>
                      <Ionicons name="people-outline" size={18} color="#9C27B0" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {userData.friends?.length || 0}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[9px]`}>Friends</CustomText>
                  </View>
                </View>

                <View style={twrnc`w-1/3 px-1`}>
                  <View style={twrnc`bg-[#0f172a] bg-opacity-0 rounded-xl p-3 items-center`}>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ===== BADGES SECTION ===== */}
          <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5 overflow-hidden relative`}>
            {/* Pattern */}
            <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`]}>
              <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                {[...Array(16)].map((_, i) => (
                  <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#FFC107]`, { transform: [{ rotate: "45deg" }] }]} />
                ))}
              </View>
            </View>

            <View style={twrnc`relative z-10`}>
              <View style={twrnc`flex-row items-center justify-between mb-3`}>
                <View style={twrnc`flex-row items-center`}>
                  <View style={twrnc`w-0.5 h-4 bg-[#FFC107] rounded-full mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                    Badges ({badges.length})
                  </CustomText>
                </View>
                {badges.length > 0 && (
                  <TouchableOpacity onPress={handleViewAllBadges} activeOpacity={0.7}>
                    <CustomText style={twrnc`text-[#4361EE] text-xs`}>See All</CustomText>
                  </TouchableOpacity>
                )}
              </View>

              {badges.length > 0 ? (
                <BadgeGrid badges={badges.slice(0, 6)} onBadgePress={handleBadgePress} variant="compact" />
              ) : (
                <View style={twrnc`items-center py-8`}>
                  <View style={twrnc`bg-[#0f172a] rounded-full p-4 mb-3`}>
                    <Ionicons name="trophy-outline" size={32} color="#6B7280" />
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-xs text-center`}>
                    Complete activities and challenges to earn badges!
                  </CustomText>
                </View>
              )}
            </View>
          </View>

          {/* ===== ACCOUNT INFO ===== */}
          <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5 overflow-hidden relative`}>
            {/* Pattern */}
            <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`]}>
              <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                {[...Array(16)].map((_, i) => (
                  <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#9C27B0]`, { transform: [{ rotate: "45deg" }] }]} />
                ))}
              </View>
            </View>

            <View style={twrnc`relative z-10`}>
              <View style={twrnc`flex-row items-center mb-3`}>
                <View style={twrnc`w-0.5 h-4 bg-[#9C27B0] rounded-full mr-2`} />
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Account Info
                </CustomText>
              </View>

              <View style={twrnc`bg-[#0f172a] rounded-xl p-3 mb-2`}>
                <View style={twrnc`flex-row items-center justify-between`}>
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-full p-2 mr-3`}>
                      <Ionicons name="calendar-outline" size={14} color="#4361EE" />
                    </View>
                    <View>
                      <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>Joined</CustomText>
                      <CustomText weight="medium" style={twrnc`text-white text-xs`}>
                        {formatTimestamp(userData.createdAt)}
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>

              <View style={twrnc`bg-[#0f172a] rounded-xl p-3`}>
                <View style={twrnc`flex-row items-center justify-between`}>
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`bg-[#06D6A0] bg-opacity-20 rounded-full p-2 mr-3`}>
                      <Ionicons name="pulse-outline" size={14} color="#06D6A0" />
                    </View>
                    <View>
                      <CustomText style={twrnc`text-gray-400 text-[9px] mb-0.5`}>Last Activity</CustomText>
                      <CustomText weight="medium" style={twrnc`text-white text-xs`}>
                        {formatTimestamp(userData.lastActivityDate)}
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ===== DRAWER MENU ===== */}
      {isDrawerOpen && (
        <TouchableOpacity
          style={[twrnc`absolute inset-0 bg-black`, { backgroundColor: "rgba(0,0,0,0.5)" }]}
          activeOpacity={1}
          onPress={closeDrawer}
        >
          <Animated.View
            style={[
              twrnc`absolute top-0 right-0 bottom-0 w-4/5 bg-[#1e293b] shadow-2xl`,
              {
                transform: [{ translateX: drawerAnimation }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={twrnc`flex-1 pt-12`}>
              {/* Drawer Header */}
              <View style={twrnc`px-5 pb-5 border-b border-gray-700`}>
                <View style={twrnc`flex-row items-center justify-between mb-4`}>
                  <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                    Menu
                  </CustomText>
                  <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={closeDrawer}>
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <View style={twrnc`flex-row items-center`}>
                  <Image source={{ uri: userData.avatar }} style={twrnc`w-12 h-12 rounded-full mr-3 border border-[#4361EE]`} />
                  <View style={twrnc`flex-1`}>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-0.5`}>
                      {userData.username}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[10px]`}>{userData.email}</CustomText>
                  </View>
                </View>
              </View>

              {/* Menu Items */}
              <ScrollView style={twrnc`flex-1 pt-4`} showsVerticalScrollIndicator={false}>
                {drawerMenuItems.map(renderDrawerMenuItem)}
              </ScrollView>

              {/* Footer */}
              <View style={twrnc`p-5 border-t border-gray-700`}>
                <CustomText style={twrnc`text-gray-500 text-center text-[10px]`}>HakbangQuest v1.0.0</CustomText>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* ===== MODALS ===== */}
      <CustomModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        icon="sign-out"
        title="Confirm Logout"
        message="Are you sure you want to log out? Your progress will be saved automatically."
        type="warning"
      />

      <CustomModal {...modalProps} visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* Edit Profile Modal */}
      <Modal animationType="slide" transparent={true} visible={showEditProfileModal} onRequestClose={() => setShowEditProfileModal(false)}>
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-4/5`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-5 bg-[#4361EE] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                  Edit Profile
                </CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={() => setShowEditProfileModal(false)}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Profile Picture */}
              <View style={twrnc`items-center mb-5`}>
                <CustomText weight="bold" style={twrnc`text-white text-sm mb-3`}>
                  Profile Picture
                </CustomText>
                {uploading ? (
                  <View style={twrnc`w-24 h-24 rounded-full bg-[#0f172a] items-center justify-center border-2 border-[#4361EE]`}>
                    <ActivityIndicator size="small" color="#4361EE" />
                  </View>
                ) : (
                  <>
                    <Image source={{ uri: userData.avatar }} style={twrnc`w-24 h-24 rounded-full border-2 border-[#4361EE] mb-3`} />
                    <TouchableOpacity style={twrnc`bg-[#4361EE] rounded-full px-5 py-2`} onPress={selectImage} activeOpacity={0.8}>
                      <View style={twrnc`flex-row items-center`}>
                        <Ionicons name="camera" size={14} color="white" style={twrnc`mr-1.5`} />
                        <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                          Change Picture
                        </CustomText>
                      </View>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Username */}
              <View style={twrnc`mb-5`}>
                <CustomText weight="bold" style={twrnc`text-white text-sm mb-2`}>
                  Username
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#0f172a] text-white rounded-xl px-4 py-3 text-sm border border-gray-700`}
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#6B7280"
                  maxLength={20}
                />
                <CustomText style={twrnc`text-gray-500 text-[10px] mt-1.5`}>
                  Username must be 3+ characters: letters, numbers, underscores only
                </CustomText>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={twrnc`bg-[#4361EE] rounded-xl py-3.5 items-center justify-center ${savingUsername ? "opacity-50" : ""}`}
                onPress={saveUsername}
                disabled={savingUsername}
                activeOpacity={0.8}
              >
                {savingUsername ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={twrnc`flex-row items-center`}>
                    <Ionicons name="checkmark-circle" size={18} color="white" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                      Save Changes
                    </CustomText>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Help & Support Modal */}
      {/* HELP MODAL with ACCORDION & DIRECT EMAIL */}
      <Modal animationType="slide" transparent={true} visible={showHelpSupportModal} onRequestClose={() => setShowHelpSupportModal(false)}>
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-4/5`}>
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <CustomText weight="bold" style={twrnc`text-white text-lg`}>Help & Support</CustomText>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={() => setShowHelpSupportModal(false)}><Ionicons name="close" size={20} color="#FFFFFF" /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <CustomText weight="bold" style={twrnc`text-white text-sm mb-3`}>Frequently Asked Questions</CustomText>

              {/* ✅ FIXED: FAQ Accordion */}
              {faqItems.map((item) => {
                const isExpanded = expandedFaqId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={twrnc`bg-[#0f172a] rounded-xl p-4 mb-3`}
                    onPress={() => toggleFaq(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={twrnc`flex-row items-center justify-between`}>
                      <View style={twrnc`flex-1 mr-3`}>
                        <CustomText weight="medium" style={twrnc`text-white text-xs`}>{item.question}</CustomText>
                      </View>
                      <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={18} color="#6B7280" />
                    </View>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <View style={twrnc`mt-3 pt-3 border-t border-gray-700`}>
                        <CustomText style={twrnc`text-gray-400 text-xs leading-5`}>{item.answer}</CustomText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              <CustomText weight="bold" style={twrnc`text-white text-sm mb-2 mt-4`}>Contact Support</CustomText>
              <CustomText style={twrnc`text-gray-400 text-xs mb-3`}>Need help? Our support team is here.</CustomText>

              {/* ✅ FIXED: Direct Email Button */}
              <TouchableOpacity
                style={twrnc`bg-[#FF6B35] rounded-xl py-3 items-center`}
                onPress={contactSupport} // Calls the fixed function directly
                activeOpacity={0.8}
              >
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="mail-outline" size={16} color="white" style={twrnc`mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>Email Support</CustomText>
                </View>
              </TouchableOpacity>

              <View style={twrnc`mt-6 bg-[#0f172a] rounded-xl p-4`}>
                <View style={twrnc`flex-row justify-between`}><CustomText style={twrnc`text-gray-400 text-xs`}>Version</CustomText><CustomText style={twrnc`text-white text-xs`}>1.0.0</CustomText></View>
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
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-4/5`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-5 bg-[#9C27B0] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                  Privacy Settings
                </CustomText>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={() => setShowPrivacySettingsModal(false)}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <CustomText weight="bold" style={twrnc`text-white text-sm mb-3`}>
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
              ].map((setting) => (
                <TouchableOpacity
                  key={setting.key}
                  style={twrnc`bg-[#0f172a] rounded-xl p-4 mb-3 flex-row items-center justify-between`}
                  onPress={() => togglePrivacySetting(setting.key)}
                  activeOpacity={0.7}
                >
                  <View style={twrnc`flex-1 mr-3`}>
                    <CustomText weight="medium" style={twrnc`text-white text-xs mb-1`}>
                      {setting.title}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-[10px]`}>{setting.description}</CustomText>
                  </View>
                  <View
                    style={[
                      twrnc`w-12 h-6 rounded-full flex-row items-center px-0.5`,
                      userData.privacySettings[setting.key] ? twrnc`bg-[#06D6A0] justify-end` : twrnc`bg-gray-600 justify-start`,
                    ]}
                  >
                    <View style={twrnc`w-5 h-5 bg-white rounded-full`} />
                  </View>
                </TouchableOpacity>
              ))}

              {/* Save Button */}
              <TouchableOpacity
                style={twrnc`bg-[#9C27B0] rounded-xl py-3.5 items-center justify-center mb-5 ${savingPrivacySettings ? "opacity-50" : ""
                  }`}
                onPress={savePrivacySettings}
                disabled={savingPrivacySettings}
                activeOpacity={0.8}
              >
                {savingPrivacySettings ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                    Save Privacy Settings
                  </CustomText>
                )}
              </TouchableOpacity>

              {/* Data Privacy Info */}
              <View style={twrnc`bg-[#0f172a] rounded-xl p-4`}>
                <CustomText weight="bold" style={twrnc`text-white text-sm mb-2`}>
                  Data Privacy
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs mb-3`}>
                  We value your privacy. Your data is stored securely and is only used to provide you with the best experience.
                </CustomText>

                <TouchableOpacity
                  style={twrnc`border border-[#9C27B0] rounded-xl py-2.5 items-center mb-2`}
                  onPress={() => setShowPrivacyPolicyModal(true)}
                  activeOpacity={0.8}
                >
                  <CustomText style={twrnc`text-[#9C27B0] text-xs`}>View Privacy Policy</CustomText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={twrnc`border border-[#9C27B0] rounded-xl py-2.5 items-center`}
                  onPress={handleRequestData}
                  activeOpacity={0.8}
                >
                  <CustomText style={twrnc`text-[#9C27B0] text-xs`}>Request My Data</CustomText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ✅ NEW: INLINE PRIVACY POLICY MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPrivacyPolicyModal}
        onRequestClose={() => setShowPrivacyPolicyModal(false)}
      >
        <View style={twrnc`flex-1 bg-black/50 justify-end`}>
          <View style={twrnc`bg-[#1e293b] rounded-t-3xl p-5 h-5/6`}>
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-center mb-5`}>
              <View style={twrnc`flex-row items-center`}>
                <View style={twrnc`w-1 h-5 bg-[#9C27B0] rounded-full mr-2.5`} />
                <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                  Privacy Policy
                </CustomText>
              </View>
              <TouchableOpacity
                style={twrnc`bg-[#0f172a] p-2 rounded-xl`}
                onPress={() => setShowPrivacyPolicyModal(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Policy Content */}
            <ScrollView showsVerticalScrollIndicator={false} style={twrnc`mb-4`}>
              <CustomText style={twrnc`text-gray-300 text-sm mb-4 leading-6`}>
                Last updated: February 2026
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>1. Introduction</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-4 leading-5`}>
                Welcome to HakbangQuest. We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, and share your information when you use our fitness application.
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>2. Information We Collect</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-4 leading-5`}>
                <CustomText weight="bold" style={twrnc`text-white`}>• Personal Data:</CustomText> We collect information such as your name, email address, and profile picture.{'\n'}
                <CustomText weight="bold" style={twrnc`text-white`}>• Fitness Data:</CustomText> We track your distance, duration, and route locations to provide gameplay features.{'\n'}
                <CustomText weight="bold" style={twrnc`text-white`}>• Device Data:</CustomText> We may collect device type and operating system info for compatibility.
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>3. How We Use Your Data</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-4 leading-5`}>
                We use your data to:{'\n'}
                • Track your fitness progress and update your stats.{'\n'}
                • Display your position on the leaderboard (if enabled).{'\n'}
                • Maintain your account and save your game progress.{'\n'}
                • Improve the app functionality and user experience.
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>4. Data Sharing</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-4 leading-5`}>
                We do not sell your personal data. Your data is only visible to other users if you explicitly enable "Public Profile" in your Privacy Settings.
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>5. Your Rights</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-4 leading-5`}>
                You have the right to request access to your data or request deletion of your account. You can manage these preferences in the Privacy Settings menu.
              </CustomText>

              <CustomText weight="bold" style={twrnc`text-white text-base mb-2`}>6. Contact Us</CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm mb-8 leading-5`}>
                If you have any questions about this policy, please contact us via the Help & Support section.
              </CustomText>
            </ScrollView>

            {/* Close Button at Bottom */}
            <TouchableOpacity
              style={twrnc`bg-[#4361EE] rounded-xl py-3.5 items-center`}
              onPress={() => setShowPrivacyPolicyModal(false)}
            >
              <CustomText weight="bold" style={twrnc`text-white text-sm`}>I Understand</CustomText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Badge Modals */}
      <BadgeModal visible={isBadgeModalVisible} badge={selectedBadge} onClose={() => setIsBadgeModalVisible(false)} />
      <AllBadgesModal
        visible={isAllBadgesModalVisible}
        badges={badges}
        onClose={() => setIsAllBadgesModalVisible(false)}
        onBadgePress={handleBadgePress}
      />
    </View>
  )
}

export default ProfileScreen
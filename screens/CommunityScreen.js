"use client"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
  TextInput,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import { db, auth } from "../firebaseConfig"
import CustomModal from "../components/CustomModal"
import NotificationService from "../services/NotificationService"
import AnimatedButton from "../components/buttons/AnimatedButton"
import ChallengeDetailsModal from "../components/modals/ChallengeDetailsModal"
import CreateChallengeModal from "../components/modals/CreateChallengeModal"

// Import icons
import WalkingIcon from "../components/icons/walking.png"
import RunningIcon from "../components/icons/running.png"
import CyclingIcon from "../components/icons/cycling.png"
import JoggingIcon from "../components/icons/jogging.png"
import PushupIcon from "../components/icons/pushup.png"

// Import backend functions
import {
  DIFFICULTY_LEVELS,
  CHALLENGE_GROUP_TYPES, // Import the new constant
  loadUserProfile,
  loadInitialFriends,
  loadFriendsPage,
  loadFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  searchUsers,
  loadChallenges,
  createChallenge,
  createCustomChallenge,
  joinChallenge,
  loadLeaderboardData,
  sendChatMessage,
  setUserOnlineStatus,
  setUserOfflineStatus,
  formatLastActive,
  formatTime,
  formatActivityDescription,
  deleteChallenge,
  completeChallenge,
  updateChallengeProgress,
} from "../utils/CommunityBackend"

// Default avatar image to use when user has no avatar
const DEFAULT_AVATAR = "https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg"

// Debounce function
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  return debouncedValue
}

const CommunityScreen = ({ navigateToDashboard, navigateToActivity, params = {} }) => {
  const [activeTab, setActiveTab] = useState("friends")
  const [searchQuery, setSearchQuery] = useState("")
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [challenges, setChallenges] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [isAddFriendModalVisible, setIsAddFriendModalVisible] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [isFriendProfileVisible, setIsFriendProfileVisible] = useState(false)
  const [isCreateChallengeModalVisible, setIsCreateChallengeModalVisible] = useState(false)
  const [isEditChallengeModalVisible, setIsEditChallengeModalVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({})
  const [newChallenge, setNewChallenge] = useState({
    title: "",
    description: "",
    type: "walking",
    goal: 5,
    unit: "km",
    durationDays: 0,
    durationHours: 0,
    durationMinutes: 0,
    durationSeconds: 0,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    groupType: "public",
    selectedFriendsForGroupChallenge: [],
    xpReward: 50,
    xpPenalty: 10,
    completionRequirement: "complete_goal",
  });
  const [friendsPage, setFriendsPage] = useState(1)
  const [hasMoreFriends, setHasMoreFriends] = useState(true)
  const [loadingMoreFriends, setLoadingMoreFriends] = useState(false)
  const [friendActivitiesCache, setFriendActivitiesCache] = useState({})
  const [offlineMode, setOfflineMode] = useState(false)
  const [lastOnlineSync, setLastOnlineSync] = useState(null)

  // Custom challenge states
  const [isCustomChallengeModalVisible, setIsCustomChallengeModalVisible] = useState(false)
  const [customChallenge, setCustomChallenge] = useState({
    activityType: "walking",
    goal: 5,
    difficulty: "medium",
    duration: 0, // days
    title: "",
    description: "",
  })
  const [challengeTargetFriend, setChallengeTargetFriend] = useState(null)

  // Loading states
  const [sendingFriendRequests, setSendingFriendRequests] = useState({})
  const [processingRequests, setProcessingRequests] = useState({})
  const [joiningChallenges, setJoiningChallenges] = useState({})
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [creatingChallenge, setCreatingChallenge] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [sendingChallenge, setSendingChallenge] = useState(false)
  // const [openingChat, setOpeningChat] = useState(false) // Removed

  const [modalVisible, setModalVisible] = useState(false)
  const [modalProps, setModalProps] = useState({
    title: "",
    message: "",
    type: "success",
    confirmText: "OK",
    showCancelButton: false,
    onConfirm: () => setModalVisible(false),
    onCancel: () => setModalVisible(false),
  })

  // New state for selected challenge and modal visibility
  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [isChallengeDetailsVisible, setIsChallengeDetailsVisible] = useState(false)

  // QuickChat states
  const [isQuickChatVisible, setIsQuickChatVisible] = useState(false);
  const [quickChatSelectedFriend, setQuickChatSelectedFriend] = useState(null);
  const [quickChatMessage, setQuickChatMessage] = useState("");
  const [sendingQuickMessage, setSendingQuickMessage] = useState(false);


  const activities = useMemo(
    () => [
      {
        id: "walking",
        name: "Walking",
        icon: WalkingIcon,
        met: 3.5,
        color: "#4361EE",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        defaultGoal: 5, // km
        unit: "km",
        goalOptions: [1, 2, 5, 10], // km
      },
      {
        id: "running",
        name: "Running",
        icon: RunningIcon,
        met: 8.0,
        color: "#EF476F",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        defaultGoal: 5, // km
        unit: "km",
        goalOptions: [1, 3, 5, 10], // km
      },
      {
        id: "cycling",
        name: "Cycling",
        icon: CyclingIcon,
        met: 6.0,
        color: "#06D6A0",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        defaultGoal: 10, // km
        unit: "km",
        goalOptions: [5, 10, 20, 50], // km
      },
      {
        id: "jogging",
        name: "Jogging",
        icon: JoggingIcon,
        met: 7.0,
        color: "#FFC107",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        defaultGoal: 3, // km
        unit: "km",
        goalOptions: [1, 2, 3, 5], // km
      },
      {
        id: "pushup",
        name: "Push-ups",
        icon: PushupIcon,
        met: 3.8,
        color: "#9B5DE5",
        iconColor: "#FFFFFF",
        isGpsActivity: false,
        defaultGoal: 50, // reps
        unit: "reps",
        goalOptions: [10, 25, 50, 100], // reps
      },
    ],
    []
  );

  // Helper to show modal
  const showModal = ({
    title = "Notice",
    message = "",
    type = "info",
    confirmText = "OK",
    showCancelButton = false,
    onConfirm,
    onCancel,
  }) => {
    setModalProps({
      title,
      message,
      type,
      confirmText,
      showCancelButton,
      onConfirm: onConfirm || (() => setModalVisible(false)),
      onCancel: onCancel || (() => setModalVisible(false)),
    })
    setModalVisible(true)
  }

  // Debounced search query
  const debouncedSearchQuery = useDebounce(searchQuery, 500)

  // Refs for unsubscribing from listeners
  const unsubscribersRef = useRef([])
  // const chatScrollRef = useRef(null) // Removed
  const { width } = Dimensions.get("window")
  const lastOnlineUpdateRef = useRef(0)
  const friendsPerPage = 5

  // Enhanced tab configuration
  const tabs = [
    {
      id: "friends",
      label: "Friends",
      icon: "people-outline",
      color: "#4361EE",
      bgColor: "#4361EE20",
      count: userProfile?.friends?.length || 0,
    },
    {
      id: "requests",
      label: "Requests",
      icon: "person-add-outline",
      color: "#06D6A0",
      bgColor: "#06D6A020",
      count: friendRequests.length,
    },
    {
      id: "challenges",
      label: "Challenges",
      icon: "trophy-outline",
      color: "#FFC107",
      bgColor: "#FFC10720",
      count: challenges.length,
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      icon: "podium-outline",
      color: "#FF6B35",
      bgColor: "#FF6B3520",
      count: leaderboard.length,
    },
  ]

  // Initialize NotificationService when component mounts
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        console.log("🔔 Initializing NotificationService in CommunityScreen...")
        const success = await NotificationService.initialize()
        if (success) {
          console.log("✅ NotificationService initialized successfully")
        } else {
          console.warn("⚠️ NotificationService initialization failed")
        }
      } catch (error) {
        console.error("❌ Error initializing NotificationService:", error)
      }
    }
    initializeNotifications()
    // Cleanup on unmount
    return () => {
      const user = auth.currentUser
      if (user) {
        NotificationService.cleanup(user.uid)
      }
    }
  }, [])

  // Online status management
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return
    const updateOnlineStatus = async () => {
      try {
        const now = Date.now()
        if (now - lastOnlineUpdateRef.current > 15 * 60 * 1000) {
          await setUserOnlineStatus()
          lastOnlineUpdateRef.current = now
        }
      } catch (err) {
        console.warn("Error setting online status:", err)
      }
    }
    updateOnlineStatus()
    const intervalId = setInterval(updateOnlineStatus, 15 * 60 * 1000)
    return () => {
      clearInterval(intervalId)
      setUserOfflineStatus().catch((err) => console.warn("Error updating offline status:", err))
    }
  }, [])

  // Load user profile and initial data
  useEffect(() => {
    const callbacks = {
      setUserProfile,
      setFriends,
      setError,
      setLoading,
      setInitialLoadComplete,
      setHasMoreFriends,
      setFriendsPage,
      setLoadingMoreFriends,
    }
    const loadData = async () => {
      try {
        const userListener = await loadUserProfile(callbacks)
        if (userListener) {
          unsubscribersRef.current.push(userListener)
        }
        const user = auth.currentUser
        if (user) {
          const requestsListener = await loadFriendRequests(user.uid, { setFriendRequests, setError })
          if (requestsListener) {
            unsubscribersRef.current.push(requestsListener)
          }
          const challengesListener = await loadChallenges({ setChallenges })
          if (challengesListener) {
            unsubscribersRef.current.push(challengesListener)
          }
          await loadLeaderboardData({ setLeaderboard, setError })
        }
        setRefreshing(false)
      } catch (err) {
        console.error("Error loading initial data:", err)
        setError("Failed to load data. Please check your connection.")
        setLoading(false)
        setInitialLoadComplete(true)
      }
    }
    loadData()
    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub())
      unsubscribersRef.current = []
    }
  }, [])

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (activeTab === "leaderboard") {
        await loadLeaderboardData({ setLeaderboard, setError })
      } else if (activeTab === "challenges") {
        await loadChallenges({ setChallenges })
      } else if (activeTab === "friends" && userProfile?.friends) {
        await loadInitialFriends(userProfile.friends, {
          setFriends,
          setHasMoreFriends,
          setFriendsPage,
          setLoadingMoreFriends,
        })
      }
    } catch (err) {
      console.error("Error refreshing data:", err)
    } finally {
      setRefreshing(false)
    }
  }, [activeTab, userProfile?.friends])

  // Load more friends
  const loadMoreFriends = () => {
    if (loadingMoreFriends || !hasMoreFriends || !userProfile?.friends) return
    loadFriendsPage(userProfile.friends, friendsPage + 1, false, {
      setFriends,
      setHasMoreFriends,
      setFriendsPage,
      setLoadingMoreFriends,
    })
  }

  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp.toDate && typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    // If timestamp is a string or number, try to parse it
    const parsedDate = new Date(timestamp);
    if (!isNaN(parsedDate)) return parsedDate;
    return null;
  };

  // In your existing useEffect that handles cleanup
  useEffect(() => {
    return () => {
      // Cleanup all modal states
      setIsChallengeDetailsVisible(false);
      setIsEditChallengeModalVisible(false);
      setSelectedChallenge(null);
      setCreatingChallenge(false);
    };
  }, []);



  // Search users
  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery) {
        try {
          setSearchLoading(true)
          const results = await searchUsers(debouncedSearchQuery)
          setSearchResults(results)
        } catch (err) {
          console.error("Error searching users:", err)
          showModal({
            title: "Search Error",
            message: "There was a problem searching for users. Please try again.",
            type: "error",
          })
        } finally {
          setSearchLoading(false)
        }
      } else {
        setSearchResults([])
      }
    }
    performSearch()
  }, [debouncedSearchQuery])


  // In your activity completion logic, add this:
  const checkChallengesAfterActivity = async (activityData) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.log("No user logged in");
        return;
      }

      console.log("Checking challenges after activity:", activityData);

      // Get user's active challenges
      const userChallenges = await getUserChallenges(user.uid);
      console.log(`User has ${userChallenges.length} active challenges`);

      for (const challenge of userChallenges) {
        console.log(`Checking challenge: ${challenge.title}, Type: ${challenge.activityType}`);

        if (challenge.activityType === activityData.activityType) {
          console.log(`Challenge matches activity type: ${activityData.activityType}`);

          // Update progress for this challenge
          const currentProgress = challenge.progress?.[user.uid] || 0;
          const activityDistance = activityData.distance || 0;
          const newProgress = currentProgress + activityDistance;

          console.log(`Updating progress from ${currentProgress} to ${newProgress}`);

          await updateChallengeProgress(challenge.id, user.uid, newProgress);

          // Check if challenge is completed
          const result = await completeChallenge(challenge.id, user.uid);

          if (result.success) {
            // Show notification about XP reward
            showModal({
              title: "Challenge Completed!",
              message: `You earned ${result.xpReward} XP for completing "${challenge.title}"`,
              type: "success"
            });
          } else if (result.xpPenalty) {
            // Show notification about XP penalty
            showModal({
              title: "Challenge Failed",
              message: `You lost ${result.xpPenalty} XP for failing "${challenge.title}"`,
              type: "error"
            });
          }
        } else {
          console.log(`Challenge type ${challenge.activityType} doesn't match activity type ${activityData.activityType}`);
        }
      }
    } catch (err) {
      console.error("Error checking challenges after activity:", err);
      // Don't show error to user to avoid interrupting their flow
    }
  };

  // Friend request handlers
  const handleSendFriendRequest = async (userId) => {
    try {
      setSendingFriendRequests((prev) => ({ ...prev, [userId]: true }))
      const result = await sendFriendRequest(userId)
      setSearchResults((prevResults) =>
        prevResults.map((result) => (result.id === userId ? { ...result, requestSent: true } : result)),
      )
      showModal({
        title: "Success",
        message: result.message,
        type: "success",
      })
    } catch (err) {
      showModal({
        title: "Error",
        message: err.message,
        type: "error",
      })
    } finally {
      setSendingFriendRequests((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const handleAcceptFriendRequest = async (requestId, fromUserId) => {
    try {
      setProcessingRequests((prev) => ({ ...prev, [requestId]: "accepting" }))
      const result = await acceptFriendRequest(requestId, fromUserId, {
        setFriendRequests,
        setUserProfile,
        setFriends,
      })
      showModal({ title: "Success", message: result.message, type: "success" })
    } catch (err) {
      showModal({ title: "Error", message: err.message, type: "error" })
    } finally {
      setProcessingRequests((prev) => ({ ...prev, [requestId]: null }))
    }
  }

  const handleRejectFriendRequest = async (requestId) => {
    try {
      setProcessingRequests((prev) => ({ ...prev, [requestId]: "rejecting" }))
      const result = await rejectFriendRequest(requestId, { setFriendRequests })
      showModal({ title: "Success", message: result.message, type: "success" })
    } catch (err) {
      showModal({ title: "Error", message: err.message, type: "error" })
    } finally {
      setProcessingRequests((prev) => ({ ...prev, [requestId]: null }))
    }
  }

  // Challenge handlers
  const handleCreateChallenge = async () => {
    try {
      if (!newChallenge.title.trim()) {
        showModal({
          title: "Error",
          message: "Please enter a challenge title",
          type: "error",
        });
        return;
      }

      const now = new Date();
      const endDate = new Date(
        now.getTime() +
        (newChallenge.durationDays || 0) * 24 * 60 * 60 * 1000 +
        (newChallenge.durationHours || 0) * 60 * 60 * 1000 +
        (newChallenge.durationMinutes || 0) * 60 * 1000
      );

      // Validate friend selection for duo/lobby challenges
      if (
        newChallenge.groupType === "duo" &&
        newChallenge.selectedFriendsForGroupChallenge.length !== 1
      ) {
        showModal({
          title: "Error",
          message: "Duo challenges require exactly one friend.",
          type: "error",
        });
        return;
      }

      if (
        newChallenge.groupType === "lobby" &&
        (newChallenge.selectedFriendsForGroupChallenge.length === 0 ||
          newChallenge.selectedFriendsForGroupChallenge.length >
          CHALLENGE_GROUP_TYPES.find((t) => t.id === "lobby").maxParticipants - 1)
      ) {
        showModal({
          title: "Error",
          message: `Lobby challenges require 1 to ${CHALLENGE_GROUP_TYPES.find((t) => t.id === "lobby").maxParticipants - 1
            } friends.`,
          type: "error",
        });
        return;
      }

      setCreatingChallenge(true);

      // Save the current type and title/description before reset
      const selectedActivityType = newChallenge.type;
      const selectedTitle = newChallenge.title;
      const selectedDescription = newChallenge.description;
      const selectedGoal = newChallenge.goal;
      const selectedUnit = newChallenge.unit;

      // ✅ Create the challenge with correct endDate + durations
      const result = await createChallenge(
        {
          ...newChallenge,
          createdBy: auth.currentUser.uid,
          createdAt: now,
          endDate, // use recalculated endDate
          durationDays: newChallenge.durationDays || 0,
          durationHours: newChallenge.durationHours || 0,
          durationMinutes: newChallenge.durationMinutes || 0,
        },
        newChallenge.selectedFriendsForGroupChallenge.map((f) => f.id),
        newChallenge.groupType
      );

      // Add new challenge to state
      setChallenges((prev) => [result.challenge, ...prev]);

      // Close modal
      setIsCreateChallengeModalVisible(false);

      // Show success modal
      showModal({
        title: "Success",
        message: result.message,
        type: "success",
      });

      // Navigate or do anything with selectedType here
      navigateToActivity({
        activityType: selectedActivityType,
        title: selectedTitle,
        description: selectedDescription,
        goal: selectedGoal,
        unit: selectedUnit,
        questId: result.challenge.id, // Pass the newly created challenge ID as questId
      });

      // ✅ Reset the form including durations
      setNewChallenge({
        title: "",
        description: "",
        type: "walking", // leave blank or default if you want user to reselect
        goal: 5,
        unit: "km",
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        durationDays: 0,
        durationHours: 0,
        durationMinutes: 0,
        groupType: "public",
        selectedFriendsForGroupChallenge: [],
      });
    } catch (err) {
      showModal({
        title: "Error",
        message: err.message,
        type: "error",
      });
    } finally {
      setCreatingChallenge(false);
    }
  };

  const handleCreateCustomChallenge = async () => {
    try {
      setCreatingChallenge(true)
      const result = await createCustomChallenge(customChallenge, challengeTargetFriend)
      // Reset state and close modal
      setCustomChallenge({
        activityType: "walking",
        goal: 5,
        difficulty: "medium",
        duration: 0,
        title: "",
        description: "",
      })
      setChallengeTargetFriend(null)
      setIsCustomChallengeModalVisible(false)
      // Add new challenge to state
      setChallenges((prev) => [result.challenge, ...prev])
      showModal({
        title: "Challenge Created! 🏆",
        message: result.message,
        type: "success",
        onConfirm: () => {
          setActiveTab("challenges")
        },
      })
    } catch (err) {
      showModal({
        title: "Error",
        message: err.message,
        type: "error",
      })
    } finally {
      setCreatingChallenge(false)
    }
  }

  const handleJoinChallenge = async (challengeId) => {
    try {
      setJoiningChallenges((prev) => ({ ...prev, [challengeId]: true }))
      const result = await joinChallenge(challengeId)
      setChallenges((prev) =>
        prev.map((challenge) =>
          challenge.id === challengeId ? { ...challenge, participants: result.updatedParticipants } : challenge,
        ),
      )
      // Update the selectedChallenge if it's currently open
      setSelectedChallenge((prev) =>
        prev && prev.id === challengeId ? { ...prev, participants: result.updatedParticipants } : prev,
      )
      showModal({ title: "Success", message: result.message, type: "success" })
    } catch (err) {
      showModal({ title: "Error", message: err.message, type: "error" })
    } finally {
      setJoiningChallenges((prev) => ({ ...prev, [challengeId]: false }))
    }
  }

  // QuickChat handlers
  const handleOpenQuickChat = (friend) => {
    setQuickChatSelectedFriend(friend);
    setIsQuickChatVisible(true);
    setQuickChatMessage(""); // Clear previous message
    setIsFriendProfileVisible(false); // Add this line to close the friend profile modal
  };


  const handleSendQuickMessage = async () => {
    if (!quickChatMessage.trim() || !quickChatSelectedFriend || sendingQuickMessage) return;

    try {
      setSendingQuickMessage(true);
      const messageText = quickChatMessage.trim();
      setQuickChatMessage(""); // Clear input immediately

      const chatRoomId = [auth.currentUser.uid, quickChatSelectedFriend.id].sort().join("_");
      await sendChatMessage(chatRoomId, messageText, quickChatSelectedFriend, userProfile);

      showModal({
        title: "Message Sent",
        message: `Your message has been sent to ${quickChatSelectedFriend.displayName || quickChatSelectedFriend.username}.`,
        type: "success",
      });
    } catch (err) {
      showModal({
        title: "Error",
        message: err.message,
        type: "error",
      });
    } finally {
      setSendingQuickMessage(false);
    }
  };

  // Custom challenge helpers
  const openCustomChallengeModal = (friend) => {
    setChallengeTargetFriend(friend)
    // Set default challenge based on friend's recent activity or default to walking
    const defaultActivity = friend.lastActivity?.activityType || "walking"
    const activityConfig = activities.find((a) => a.id === defaultActivity) || activities[0]
    setCustomChallenge({
      activityType: activityConfig.id,
      goal: activityConfig.defaultGoal,
      difficulty: "medium",
      duration: 0,
      title: `${activityConfig.name} Challenge`,
      description: `Complete ${activityConfig.defaultGoal} ${activityConfig.unit} of ${activityConfig.name.toLowerCase()} in 7 days!`,
    })
    setIsCustomChallengeModalVisible(true)
    setIsFriendProfileVisible(false)
  }

  const updateChallengeActivity = (activityType) => {
    const activityConfig = activities.find((a) => a.id === activityType)
    if (activityConfig) {
      setCustomChallenge((prev) => ({
        ...prev,
        activityType,
        goal: activityConfig.defaultGoal,
        title: `${activityConfig.name} Challenge`,
        description: `Complete ${activityConfig.defaultGoal} ${activityConfig.unit} of ${activityConfig.name.toLowerCase()} in ${prev.duration} days!`,
      }))
    }
  }

  const updateChallengeDescription = (goal, duration) => {
    const activityConfig = activities.find((a) => a.id === customChallenge.activityType)
    if (activityConfig) {
      setCustomChallenge((prev) => ({
        ...prev,
        goal,
        duration,
        description: `Complete ${goal} ${activityConfig.unit} of ${activityConfig.name.toLowerCase()} in ${duration} days!`,
      }))
    }
  }

  const sendChallengeToFriend = async () => {
    try {
      setSendingChallenge(true)
      openCustomChallengeModal(selectedFriend)
    } catch (err) {
      console.error("Error opening challenge modal:", err)
      showModal({ title: "Error", message: "Failed to open challenge creator. Please try again.", type: "error" })
      setSendingChallenge(false)
    }
  }

  const viewFriendProfile = (friend) => {
    setSelectedFriend(friend)
    setIsFriendProfileVisible(true)
  }

  // Function to view challenge details
  const viewChallengeDetails = (challenge) => {
    setSelectedChallenge(challenge)
    setIsChallengeDetailsVisible(true)
  }

  // Function to navigate to ActivityScreen with challenge data
  const navigateToActivityWithChallenge = (challenge) => {
    const userId = auth.currentUser?.uid;
    const userProgressAbsolute = challenge.progress?.[userId] || 0;
    const goal = Number(challenge.goal) || 1;

    // Calculate progress fraction (0 to 1)
    const progressFraction = Math.min(userProgressAbsolute / goal, 1);

    const params = {
      questId: challenge.id,
      title: challenge.title,
      description: challenge.description,
      goal: challenge.goal,
      unit: challenge.unit,
      activityType: challenge.activityType,
      xpReward: challenge.xpReward || 50,
      difficulty: challenge.difficulty || "medium",
      category: "challenge",
      progress: progressFraction,
      status: challenge.status?.[userId] || "not_started",
      onActivityComplete: checkChallengesAfterActivity // Add callback
    };

    navigateToActivity(params);
    setIsChallengeDetailsVisible(false);
  };

  // Add this useEffect to manage modal transitions
  useEffect(() => {
    if (isEditChallengeModalVisible) {
      // If edit modal is opening, ensure details modal is closed
      setIsChallengeDetailsVisible(false);
    }
  }, [isEditChallengeModalVisible]);

  // Then update handleEditChallenge to be simpler:
  const handleEditChallenge = (challenge) => {
    if (challenge.createdBy !== auth.currentUser?.uid) {
      showModal({
        title: "Permission Denied",
        message: "Only the creator can edit this challenge.",
        type: "error",
      });
      return;
    }

    // Pre-fill editable values
    setNewChallenge({
      title: challenge.title,
      description: challenge.description,
      type: challenge.activityType,
      goal: challenge.goal,
      unit: challenge.unit,
      endDate: getDateFromTimestamp(challenge.endDate) || new Date(),
      groupType: challenge.groupType,
      difficulty: challenge.difficulty || "medium",
      xpReward: challenge.xpReward || 50,
      selectedFriendsForGroupChallenge: [],
    });

    // Store which challenge is being edited
    setSelectedChallenge(challenge);

    // Close details modal and open edit modal
    setIsChallengeDetailsVisible(false);
    setTimeout(() => setIsEditChallengeModalVisible(true), 100);
  };

  const handleSaveChallenge = async () => {
    try {
      if (selectedChallenge) {
        setCreatingChallenge(true);

        // Update existing challenge - only allow editing specific fields
        const challengeRef = doc(db, "challenges", selectedChallenge.id);
        await updateDoc(challengeRef, {
          title: newChallenge.title,
          description: newChallenge.description,
          goal: newChallenge.goal,
          unit: newChallenge.unit,
          difficulty: newChallenge.difficulty,
          xpReward: newChallenge.xpReward,
          updatedAt: serverTimestamp(),
        });

        // Update local state
        setChallenges((prev) =>
          prev.map((c) =>
            c.id === selectedChallenge.id
              ? {
                ...c,
                title: newChallenge.title,
                description: newChallenge.description,
                goal: newChallenge.goal,
                unit: newChallenge.unit,
                difficulty: newChallenge.difficulty,
                xpReward: newChallenge.xpReward,
              }
              : c
          )
        );

        showModal({
          title: "Success",
          message: "Challenge updated successfully!",
          type: "success"
        });
      }
    } catch (err) {
      console.error("Error saving challenge:", err);
      showModal({
        title: "Error",
        message: err.message || "Failed to update challenge.",
        type: "error"
      });
    } finally {
      // Always reset these states, even on error
      setCreatingChallenge(false);
      setSelectedChallenge(null);
      setIsEditChallengeModalVisible(false);
    }
  };


  // Function to handle deleting a challenge (placeholder)
  const handleDeleteChallenge = async (challengeId) => {
    showModal({
      title: "Delete Challenge",
      message: "Are you sure you want to delete this challenge? This action cannot be undone.",
      type: "warning",
      showCancelButton: true,
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          setCreatingChallenge(true); // Use loading state for deletion too

          // Actually delete from database
          const result = await deleteChallenge(challengeId);

          // Remove from local state
          setChallenges((prev) => prev.filter((c) => c.id !== challengeId));

          // Close the details modal if it's open
          setIsChallengeDetailsVisible(false);

          showModal({
            title: "Challenge Deleted",
            message: result.message,
            type: "success",
          });
        } catch (err) {
          console.error("Error deleting challenge:", err);
          showModal({
            title: "Error",
            message: err.message || "Failed to delete challenge. Please try again.",
            type: "error",
          });
        } finally {
          setCreatingChallenge(false);
        }
      },
      onCancel: () => {
        // Just close the confirmation modal, no action needed
      },
    });
  };

  // Render functions
  const renderFriendItem = ({ item }) => (
    <TouchableOpacity
      style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4 shadow-lg`}
      onPress={() => viewFriendProfile(item)}
      activeOpacity={0.8}
    >
      <View style={twrnc`flex-row items-center`}>
        <View style={twrnc`relative mr-4`}>
          <Image
            source={{ uri: item.avatar || DEFAULT_AVATAR }}
            style={twrnc`w-14 h-14 rounded-2xl border-2 border-[#4361EE]`}
          />
          <View
            style={twrnc`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#2A2E3A] ${item.isOnline ? "bg-green-500" : "bg-gray-500"
              }`}
          />
        </View>
        <View style={twrnc`flex-1`}>
          <View style={twrnc`flex-row items-center justify-between mb-2`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg`}>
              {item.displayName || item.username || "User"}
            </CustomText>
            <View style={twrnc`flex-row items-center bg-[#FFC10720] px-3 py-1 rounded-xl`}>
              <Ionicons name="flame" size={16} color="#FFC107" />
              <CustomText weight="bold" style={twrnc`text-[#FFC107] ml-1`}>
                {item.streak || 0}
              </CustomText>
            </View>
          </View>
          <CustomText style={twrnc`text-gray-400 text-sm mb-3`}>
            {formatActivityDescription(item.lastActivity)}
          </CustomText>
          <View style={twrnc`flex-row justify-between`}>
            <View style={twrnc`items-center`}>
              <CustomText weight="semibold" style={twrnc`text-[#4361EE] text-sm`}>
                {item.totalDistance ? item.totalDistance.toFixed(1) : "0"} km
              </CustomText>
              <CustomText style={twrnc`text-gray-500 text-xs`}>Distance</CustomText>
            </View>
            <View style={twrnc`items-center`}>
              <CustomText weight="semibold" style={twrnc`text-[#06D6A0] text-sm`}>
                {item.totalActivities || 0}
              </CustomText>
              <CustomText style={twrnc`text-gray-500 text-xs`}>Activities</CustomText>
            </View>
            <View style={twrnc`items-center`}>
              <CustomText weight="semibold" style={twrnc`text-gray-400 text-sm`}>
                {item.isOnline ? "Online" : "Offline"}
              </CustomText>
              <CustomText style={twrnc`text-gray-500 text-xs`}>Status</CustomText>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )

  const renderRequestItem = ({ item }) => (
    <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4 shadow-lg`}>
      <View style={twrnc`flex-row items-center`}>
        <View style={twrnc`relative mr-4`}>
          <Image
            source={{ uri: item.fromUser.avatar || DEFAULT_AVATAR }}
            style={twrnc`w-14 h-14 rounded-2xl border-2 border-[#06D6A0]`}
          />
          <View
            style={twrnc`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#2A2E3A] ${item.fromUser.isOnline ? "bg-green-500" : "bg-gray-500"
              }`}
          />
        </View>
        <View style={twrnc`flex-1`}>
          <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
            {item.fromUser.displayName || item.fromUser.username || "User"}
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm mb-4`}>
            {item.mutualFriends > 0
              ? `${item.mutualFriends} mutual friend${item.mutualFriends > 1 ? "s" : ""}`
              : "No mutual friends"}
          </CustomText>
          <View style={twrnc`flex-row justify-between`}>
            <TouchableOpacity
              style={twrnc`${processingRequests[item.id] === "accepting" ? "bg-green-700" : "bg-[#06D6A0]"
                } flex-1 py-3 rounded-xl mr-2 items-center`}
              onPress={() => handleAcceptFriendRequest(item.id, item.fromUser.id)}
              disabled={processingRequests[item.id] !== undefined}
              activeOpacity={0.8}
            >
              {processingRequests[item.id] === "accepting" ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="checkmark" size={18} color="white" />
                  <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                    Accept
                  </CustomText>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={twrnc`${processingRequests[item.id] === "rejecting" ? "bg-red-700" : "bg-[#EF4444]"
                } flex-1 py-3 rounded-xl ml-2 items-center`}
              onPress={() => handleRejectFriendRequest(item.id)}
              disabled={processingRequests[item.id] !== undefined}
              activeOpacity={0.8}
            >
              {processingRequests[item.id] === "rejecting" ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="close" size={18} color="white" />
                  <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                    Decline
                  </CustomText>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  )

  const renderChallengeItem = ({ item }) => {
    const userId = auth.currentUser?.uid;

    // Handle participants
    const isFull = item.maxParticipants && item.participants?.length >= item.maxParticipants;
    const isJoined = Array.isArray(item.participants) && item.participants.includes(userId);

    // ✅ Check if user is invited to private challenges - handle both field names
    const isPublicChallenge = item.groupType === "public";

    // Check both invitedUsers and invited fields for backward compatibility
    const invitedUsersList = Array.isArray(item.invitedUsers) ? item.invitedUsers :
      (Array.isArray(item.invited) ? item.invited : []);

    // ✅ FIX: Creator should always be considered invited to their own challenges
    const isCreator = item.createdBy === userId;
    const isInvited = isPublicChallenge || invitedUsersList.includes(userId) || isCreator;

    // ✅ Hide private challenges that user is not invited to
    if (!isPublicChallenge && !isInvited) {
      return null; // This will hide the challenge from the list
    }

    const canJoin = !isJoined && !isFull && isInvited;

    // Safely access progress and status
    const userProgress = item.progress?.[userId] ?? 0;
    const userStatus = item.status?.[userId] ?? "not_started";

    // Find the activity configuration to get the correct unit
    const activityConfig = activities.find((act) => act.id === item.activityType);
    const unitDisplay = activityConfig ? activityConfig.unit : item.unit || "";

    return (
      <TouchableOpacity
        style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4 shadow-lg`}
        onPress={() => viewChallengeDetails(item)}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={twrnc`flex-row items-center mb-4`}>
          <View style={twrnc`w-16 h-16 rounded-2xl bg-[#FFC10720] items-center justify-center mr-4`}>
            {item.icon ? (
              <Image source={{ uri: item.icon }} style={twrnc`w-10 h-10`} resizeMode="contain" />
            ) : (
              <Ionicons name="trophy" size={32} color="#FFC107" />
            )}
          </View>
          <View style={twrnc`flex-1`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
              {item.title}
            </CustomText>

            {/* Challenge tags */}
            <View style={twrnc`flex-row items-center mb-2`}>
              <View style={twrnc`bg-[#4361EE20] px-3 py-1 rounded-xl mr-2`}>
                <CustomText style={twrnc`text-[#4361EE] text-xs font-medium`}>
                  {item.activityType
                    ? item.activityType.charAt(0).toUpperCase() + item.activityType.slice(1)
                    : "Challenge"}
                </CustomText>
              </View>
              <View style={twrnc`bg-[#06D6A020] px-3 py-1 rounded-xl`}>
                <CustomText style={twrnc`text-[#06D6A0] text-xs font-medium`}>
                  {String(item.participants?.length || 0)} / {String(item.maxParticipants || "∞")} joined
                </CustomText>
              </View>
              {item.groupType && item.groupType !== "public" && (
                <View style={twrnc`bg-[#9B5DE520] px-3 py-1 rounded-xl ml-2`}>
                  <CustomText style={twrnc`text-[#9B5DE5] text-xs font-medium capitalize`}>
                    {item.groupType}
                  </CustomText>
                </View>
              )}
            </View>

            {/* Dates, goal, difficulty */}
            <View style={twrnc`flex-row items-center`}>
              <Ionicons name="time-outline" size={14} color="#FFC107" />
              <CustomText style={twrnc`text-[#FFC107] text-xs ml-1`}>
                {(() => {
                  const endDateObj = getDateFromTimestamp(item.endDate);
                  return endDateObj ? `Ends ${endDateObj.toLocaleDateString()}` : "Ongoing";
                })()}
              </CustomText>

              {item.goal && item.unit && (
                <>
                  <Ionicons name="flag-outline" size={14} color="#06D6A0" style={twrnc`ml-3`} />
                  <CustomText style={twrnc`text-[#06D6A0] text-xs ml-1`}>
                    Goal: {String(item.goal)} {unitDisplay}
                  </CustomText>
                </>
              )}

              {item.difficulty && (
                <>
                  <Ionicons name="flash-outline" size={14} color="#EF476F" style={twrnc`ml-3`} />
                  <CustomText style={twrnc`text-[#EF476F] text-xs ml-1 capitalize`}>
                    {item.difficulty}
                  </CustomText>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Description */}
        {item.description && (
          <CustomText style={twrnc`text-gray-400 text-sm mb-4`}>
            {item.description}
          </CustomText>
        )}

        {/* User progress & status */}
        <View style={twrnc`mb-4`}>
          <CustomText style={twrnc`text-gray-300 text-sm`}>
            Progress: {userProgress.toFixed(1)} {unitDisplay}
          </CustomText>
          <CustomText style={twrnc`text-gray-300 text-sm`}>
            Status: {userStatus.replace(/_/g, " ")}
          </CustomText>
        </View>

        {/* Join button - Only show if user can join */}
        {canJoin && (
          <TouchableOpacity
            style={twrnc`${joiningChallenges[item.id]
              ? "bg-[#3251DD]"
              : "bg-[#4361EE]"
              } py-3 rounded-xl items-center`}
            onPress={() => handleJoinChallenge(item.id)}
            disabled={joiningChallenges[item.id]}
            activeOpacity={0.8}
          >
            {joiningChallenges[item.id] ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <View style={twrnc`flex-row items-center`}>
                <Ionicons name="add-circle-outline" size={18} color="white" />
                <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                  Join Challenge
                </CustomText>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Show joined status if already joined */}
        {isJoined && (
          <View style={twrnc`bg-[#06D6A0] py-3 rounded-xl items-center`}>
            <View style={twrnc`flex-row items-center`}>
              <Ionicons name="checkmark-circle" size={18} color="white" />
              <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                Joined
              </CustomText>
            </View>
          </View>
        )}

        {/* Show full status if challenge is full */}
        {isFull && !isJoined && (
          <View style={twrnc`bg-gray-500 py-3 rounded-xl items-center`}>
            <View style={twrnc`flex-row items-center`}>
              <Ionicons name="people" size={18} color="white" />
              <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                Full
              </CustomText>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };



  const renderSearchResultItem = ({ item }) => (
    <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4 shadow-lg`}>
      <View style={twrnc`flex-row items-center`}>
        <View style={twrnc`relative mr-4`}>
          <Image
            source={{ uri: item.avatar || DEFAULT_AVATAR }}
            style={twrnc`w-14 h-14 rounded-2xl border-2 border-[#4361EE]`}
          />
          <View
            style={twrnc`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#2A2E3A] ${item.isOnline ? "bg-green-500" : "bg-gray-500"
              }`}
          />
        </View>
        <View style={twrnc`flex-1`}>
          <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
            {item.displayName || item.username || "User"}
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm mb-3`}>
            {item.bio ? item.bio.substring(0, 50) + (item.bio.length > 50 ? "..." : "") : "No bio available"}
          </CustomText>
          {item.isFriend ? (
            <View style={twrnc`bg-[#06D6A020] py-2 px-4 rounded-xl items-center`}>
              <View style={twrnc`flex-row items-center`}>
                <Ionicons name="checkmark-circle" size={16} color="#06D6A0" />
                <CustomText weight="semibold" style={twrnc`text-[#06D6A0] ml-2`}>
                  Friends
                </CustomText>
              </View>
            </View>
          ) : item.requestSent ? (
            <View style={twrnc`bg-[#FFC10720] py-2 px-4 rounded-xl items-center`}>
              <View style={twrnc`flex-row items-center`}>
                <Ionicons name="time-outline" size={16} color="#FFC107" />
                <CustomText weight="semibold" style={twrnc`text-[#FFC107] ml-2`}>
                  Request Sent
                </CustomText>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={twrnc`${sendingFriendRequests[item.id] ? "bg-[#3251DD]" : "bg-[#4361EE]"
                } py-2 px-4 rounded-xl items-center`}
              onPress={() => handleSendFriendRequest(item.id)}
              disabled={sendingFriendRequests[item.id]}
              activeOpacity={0.8}
            >
              {sendingFriendRequests[item.id] ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="person-add-outline" size={16} color="white" />
                  <CustomText weight="semibold" style={twrnc`text-white ml-2`}>
                    Add Friend
                  </CustomText>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )

  // Removed renderChatMessage as full chat modal is removed
  /*
  const renderChatMessage = ({ item }) => {
    const user = auth.currentUser
    const isOwnMessage = item.senderId === user.uid
    return (
      <View style={twrnc`flex-row ${isOwnMessage ? "justify-end" : "justify-start"} mb-3`}>
        {!isOwnMessage && (
          <Image
            source={{ uri: selectedFriend?.avatar || DEFAULT_AVATAR }}
            style={twrnc`w-8 h-8 rounded-full mr-2 mt-1`}
          />
        )}
        <View
          style={twrnc`max-w-[80%] rounded-2xl p-3 ${isOwnMessage ? "bg-[#4361EE] rounded-tr-none" : "bg-[#2A2E3A] rounded-tl-none"
            }`}
        >
          <CustomText style={twrnc`text-white`}>{item.text}</CustomText>
          <CustomText style={twrnc`text-gray-300 text-xs mt-1 text-right`}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </CustomText>
        </View>
      </View>
    )
  }
  */

  const renderFriendsFooter = () => {
    if (!hasMoreFriends) return null
    return (
      <TouchableOpacity
        style={twrnc`items-center justify-center py-4 ${loadingMoreFriends ? "opacity-50" : ""}`}
        onPress={loadMoreFriends}
        disabled={loadingMoreFriends}
        activeOpacity={0.8}
      >
        {loadingMoreFriends ? (
          <View style={twrnc`flex-row items-center`}>
            <ActivityIndicator size="small" color="#4361EE" />
            <CustomText style={twrnc`text-[#4361EE] ml-2`}>Loading more friends...</CustomText>
          </View>
        ) : (
          <View style={twrnc`bg-[#4361EE20] px-6 py-3 rounded-xl`}>
            <CustomText weight="semibold" style={twrnc`text-[#4361EE]`}>
              Load More Friends
            </CustomText>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  const renderTabButton = (tab) => {
    const isActive = activeTab === tab.id;

    return (
      <AnimatedButton
        key={tab.id}
        style={twrnc`flex-1 items-center py-4`}
        onPress={() => setActiveTab(tab.id)}
        activeOpacity={0.8}
      >
        <View
          style={[
            twrnc`w-12 h-12 rounded-2xl items-center justify-center mb-2`,
            { backgroundColor: isActive ? tab.bgColor : "#2A2E3A" },
          ]}
        >
          <Ionicons
            name={tab.icon}
            size={24}
            color={isActive ? tab.color : "#6B7280"}
          />

          {tab.count > 0 && (
            <View
              style={[
                twrnc`absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center`,
                { backgroundColor: tab.color },
              ]}
            >
              <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                {tab.count > 99 ? "99+" : tab.count}
              </CustomText>
            </View>
          )}
        </View>

        <CustomText
          weight={isActive ? "bold" : "medium"}
          style={twrnc`text-xs ${isActive ? "text-white" : "text-gray-400"}`}
        >
          {tab.label}
        </CustomText>
      </AnimatedButton>
    );
  };



  if (loading) {
    return (
      <View style={twrnc`flex-1 bg-[#121826]`}>
        <View style={twrnc`flex-1 justify-center items-center`}>
          <View style={twrnc`w-24 h-24 rounded-3xl bg-[#4361EE20] items-center justify-center mb-6`}>
            <ActivityIndicator size="large" color="#4361EE" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
            Loading Community
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-center`}>
            Connecting you with friends and challenges...
          </CustomText>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={twrnc`flex-1 bg-[#121826]`}>
        <View style={twrnc`flex-1 justify-center items-center px-5`}>
          <View style={twrnc`w-24 h-24 rounded-3xl bg-[#EF444420] items-center justify-center mb-6`}>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-2xl mb-4 text-center`}>
            Connection Error
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-center mb-8 leading-6`}>{error}</CustomText>
          <TouchableOpacity style={twrnc`bg-[#4361EE] px-8 py-4 rounded-2xl`} onPress={onRefresh} activeOpacity={0.8}>
            <CustomText weight="semibold" style={twrnc`text-white text-base`}>
              Try Again
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={twrnc`flex-1 bg-[#121826]`}>
      {/* CustomModal integration */}
      <CustomModal visible={modalVisible} onClose={() => setModalVisible(false)} {...modalProps} />

      {/* Enhanced Header */}
      <View style={twrnc`bg-[#1A1F2E] px-4 py-4 flex-row items-center justify-between shadow-lg`}>
        <TouchableOpacity onPress={navigateToDashboard} style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={twrnc`items-center`}>
          <CustomText weight="bold" style={twrnc`text-white text-xl`}>
            Community
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm`}>
            {friends.length} friends • {challenges.length} challenges
          </CustomText>
        </View>
        <TouchableOpacity
          style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`}
          onPress={() => setIsAddFriendModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Enhanced Search Bar */}
      <View style={twrnc`px-5 py-4`}>
        <View style={twrnc`flex-row items-center bg-[#2A2E3A] rounded-2xl px-4 py-3`}>
          <Ionicons name="search-outline" size={20} color="#6B7280" />
          <TextInput
            style={twrnc`flex-1 text-white ml-3 text-base`}
            placeholder="Search friends, challenges..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Enhanced Tabs */}
      <View style={twrnc`px-5 mb-4`}>
        <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-2 flex-row`}>{tabs.map((tab) => renderTabButton(tab))}</View>
      </View>

      {/* Content based on active tab */}
      <ScrollView
        style={twrnc`flex-1 px-5`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={["#4361EE", "#FFC107"]}
            enabled={initialLoadComplete}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "friends" && (
          <>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Your Friends
              </CustomText>
              <TouchableOpacity
                onPress={() => setIsAddFriendModalVisible(true)}
                style={twrnc`bg-[#4361EE20] px-4 py-2 rounded-xl`}
                activeOpacity={0.8}
              >
                <CustomText weight="semibold" style={twrnc`text-[#4361EE]`}>
                  Add New
                </CustomText>
              </TouchableOpacity>
            </View>
            {friends.length > 0 ? (
              <>
                <FlatList
                  data={friends}
                  renderItem={renderFriendItem}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  ListFooterComponent={renderFriendsFooter}
                />
              </>
            ) : (
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-8 items-center`}>
                <View style={twrnc`w-20 h-20 rounded-3xl bg-[#4361EE20] items-center justify-center mb-4`}>
                  <Ionicons name="people-outline" size={40} color="#4361EE" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                  No Friends Yet
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-center mb-6 leading-6`}>
                  Add friends to see their activities, compete in challenges, and stay motivated together
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#4361EE] py-3 px-6 rounded-xl`}
                  onPress={() => setIsAddFriendModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <CustomText weight="semibold" style={twrnc`text-white`}>
                    Find Friends
                  </CustomText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {activeTab === "requests" && (
          <>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Friend Requests
              </CustomText>
              {friendRequests.length > 0 && (
                <View style={twrnc`bg-[#06D6A020] px-3 py-1 rounded-xl`}>
                  <CustomText weight="semibold" style={twrnc`text-[#06D6A0] text-sm`}>
                    {friendRequests.length} pending
                  </CustomText>
                </View>
              )}
            </View>
            {friendRequests.length > 0 ? (
              <FlatList
                data={friendRequests}
                renderItem={renderRequestItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-8 items-center`}>
                <View style={twrnc`w-20 h-20 rounded-3xl bg-[#06D6A020] items-center justify-center mb-4`}>
                  <Ionicons name="person-add-outline" size={40} color="#06D6A0" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                  No Friend Requests
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-center leading-6`}>
                  When someone sends you a friend request, it will appear here
                </CustomText>
              </View>
            )}
          </>
        )}

        {activeTab === "challenges" && (
          <>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Community Challenges
              </CustomText>
              <TouchableOpacity
                onPress={() => setIsCreateChallengeModalVisible(true)}
                style={twrnc`bg-[#FFC10720] px-4 py-2 rounded-xl`}
                activeOpacity={0.8}
              >
                <CustomText weight="semibold" style={twrnc`text-[#FFC107]`}>
                  Create New
                </CustomText>
              </TouchableOpacity>
            </View>
            {challenges.length > 0 ? (
              <FlatList
                data={challenges}
                renderItem={renderChallengeItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-8 items-center`}>
                <View style={twrnc`w-20 h-20 rounded-3xl bg-[#FFC10720] items-center justify-center mb-4`}>
                  <Ionicons name="trophy-outline" size={40} color="#FFC107" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                  No Active Challenges
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-center mb-6 leading-6`}>
                  Create a challenge and invite your friends to join the competition
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#FFC107] py-3 px-6 rounded-xl`}
                  onPress={() => setIsCreateChallengeModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <CustomText weight="semibold" style={twrnc`text-[#121826]`}>
                    Create Challenge
                  </CustomText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {activeTab === "leaderboard" && (
          <>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                Weekly Leaderboard
              </CustomText>
              <TouchableOpacity style={twrnc`bg-[#FF6B3520] px-4 py-2 rounded-xl`} activeOpacity={0.8}>
                <CustomText weight="semibold" style={twrnc`text-[#FF6B35]`}>
                  View All
                </CustomText>
              </TouchableOpacity>
            </View>
            <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-6`}>
              {leaderboard.length > 0 ? (
                leaderboard.map((user, index) => (
                  <View
                    key={user.id}
                    style={twrnc`flex-row items-center mb-${index < leaderboard.length - 1 ? "4" : "0"}`}
                  >
                    <View
                      style={[
                        twrnc`w-10 h-10 rounded-2xl items-center justify-center mr-4`,
                        {
                          backgroundColor:
                            index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : "#2A2E3A",
                        },
                      ]}
                    >
                      <CustomText
                        weight="bold"
                        style={twrnc`${index < 3 ? "text-[#121826]" : "text-gray-400"} text-sm`}
                      >
                        {index + 1}
                      </CustomText>
                    </View>
                    <View style={twrnc`relative mr-3`}>
                      <Image source={{ uri: user.avatar || DEFAULT_AVATAR }} style={twrnc`w-12 h-12 rounded-2xl`} />
                      <View
                        style={twrnc`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#2A2E3A] ${user.isOnline ? "bg-green-500" : "bg-gray-500"
                          }`}
                      />
                    </View>
                    <View style={twrnc`flex-1`}>
                      <View style={twrnc`flex-row items-center`}>
                        <CustomText weight={user.isCurrentUser ? "bold" : "semibold"} style={twrnc`text-white`}>
                          {user.isCurrentUser ? "You" : user.name}
                        </CustomText>
                        {user.isCurrentUser && (
                          <View style={twrnc`ml-2 bg-[#4361EE] rounded-full px-2 py-0.5`}>
                            <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                              You
                            </CustomText>
                          </View>
                        )}
                      </View>
                      <View style={twrnc`flex-row items-center mt-1`}>
                        <Ionicons name="trophy" size={12} color="#FFC107" />
                        <CustomText style={twrnc`text-[#FFC107] text-xs ml-1`}>
                          Lvl {user.level || 1}
                        </CustomText>
                      </View>
                    </View>
                    <View style={twrnc`items-end`}>
                      <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-lg`}>
                        {user.exp.toLocaleString()}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>EXP</CustomText>
                    </View>
                  </View>
                ))
              ) : (
                <View style={twrnc`items-center justify-center py-6`}>
                  <Ionicons name="trophy-outline" size={36} color="#FFC107" />
                  <CustomText style={twrnc`text-white text-center mt-4`}>No leaderboard data yet</CustomText>
                  <CustomText style={twrnc`text-gray-400 text-center mt-2`}>
                    Complete activities to appear on the leaderboard
                  </CustomText>
                </View>
              )}
            </View>

            {/* Activity Stats */}
            <View style={twrnc`mb-8`}>
              <CustomText weight="bold" style={twrnc`text-white text-xl mb-4`}>
                Your Community Stats
              </CustomText>
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5`}>
                <View style={twrnc`flex-row justify-between mb-6`}>
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`w-12 h-12 rounded-2xl bg-[#4361EE20] items-center justify-center mb-2`}>
                      <Ionicons name="people-outline" size={24} color="#4361EE" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      {userProfile?.friends?.length || 0}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Friends</CustomText>
                  </View>
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`w-12 h-12 rounded-2xl bg-[#FFC10720] items-center justify-center mb-2`}>
                      <Ionicons name="trophy-outline" size={24} color="#FFC107" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      {challenges.length}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Challenges</CustomText>
                  </View>
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`w-12 h-12 rounded-2xl bg-[#FF6B3520] items-center justify-center mb-2`}>
                      <Ionicons name="podium-outline" size={24} color="#FF6B35" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      {leaderboard.findIndex((user) => user.isCurrentUser) + 1 || "-"}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Rank</CustomText>
                  </View>
                </View>

                {/* Add EXP display to user stats */}
                <View style={twrnc`flex-row justify-between mb-4`}>
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`w-12 h-12 rounded-2xl bg-[#06D6A020] items-center justify-center mb-2`}>
                      <Ionicons name="walk-outline" size={24} color="#06D6A0" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      {leaderboard.find(user => user.isCurrentUser)?.distance?.toFixed(1) || "0"}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Distance (km)</CustomText>
                  </View>
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`w-12 h-12 rounded-2xl bg-[#9B5DE520] items-center justify-center mb-2`}>
                      <Ionicons name="star" size={24} color="#9B5DE5" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      {leaderboard.find(user => user.isCurrentUser)?.exp?.toLocaleString() || "0"}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Total EXP</CustomText>
                  </View>
                </View>

                <TouchableOpacity
                  style={twrnc`bg-[#4361EE20] rounded-xl p-4 items-center`}
                  onPress={() => {
                    // Navigation to profile
                    showModal({ title: "Navigation", message: "Navigating to Profile (placeholder)", type: "info" });
                  }}
                  activeOpacity={0.8}
                >
                  <CustomText weight="semibold" style={twrnc`text-[#4361EE]`}>
                    View Your Profile
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Add Friend Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddFriendModalVisible}
        onRequestClose={() => setIsAddFriendModalVisible(false)}
      >
        <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
          <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-2xl`}>
                Find Friends
              </CustomText>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                onPress={() => setIsAddFriendModalVisible(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={twrnc`flex-row items-center bg-[#2A2E3A] rounded-2xl px-4 py-3 mb-6`}>
              <Ionicons name="search-outline" size={20} color="#6B7280" />
              <TextInput
                style={twrnc`flex-1 text-white ml-3 text-base`}
                placeholder="Search by name or username..."
                placeholderTextColor="#6B7280"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery("")
                    setSearchResults([])
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
            {searchLoading ? (
              <View style={twrnc`items-center justify-center py-12`}>
                <ActivityIndicator size="large" color="#4361EE" />
                <CustomText style={twrnc`text-white mt-4`}>Searching...</CustomText>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderSearchResultItem}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
              />
            ) : searchQuery.length > 0 ? (
              <View style={twrnc`items-center justify-center py-12`}>
                <View style={twrnc`w-20 h-20 rounded-3xl bg-[#6B728020] items-center justify-center mb-4`}>
                  <Ionicons name="search-outline" size={40} color="#6B7280" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                  No Results Found
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-center`}>
                  No users found matching "{searchQuery}"
                </CustomText>
              </View>
            ) : (
              <View style={twrnc`items-center justify-center py-12`}>
                <View style={twrnc`w-20 h-20 rounded-3xl bg-[#4361EE20] items-center justify-center mb-4`}>
                  <Ionicons name="people-outline" size={40} color="#4361EE" />
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                  Search for Friends
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-center px-6`}>
                  Find friends by searching their name or username
                </CustomText>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <CreateChallengeModal
        isVisible={isCreateChallengeModalVisible}
        onClose={() => setIsCreateChallengeModalVisible(false)}
        newChallenge={newChallenge}
        setNewChallenge={setNewChallenge}
        friends={friends}
        activities={activities}
        CHALLENGE_GROUP_TYPES={CHALLENGE_GROUP_TYPES}
        DIFFICULTY_LEVELS={DIFFICULTY_LEVELS}
        handleCreateChallenge={handleCreateChallenge}
        creatingChallenge={creatingChallenge}
        showModal={showModal}
        DEFAULT_AVATAR={DEFAULT_AVATAR}
      />

      {/* Custom Challenge Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCustomChallengeModalVisible}
        onRequestClose={() => setIsCustomChallengeModalVisible(false)}
      >
        <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
          <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-4/5`}>
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <View style={twrnc`flex-1`}>
                <CustomText weight="bold" style={twrnc`text-white text-2xl mb-1`}>
                  Challenge {challengeTargetFriend?.displayName || challengeTargetFriend?.username}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-sm`}>Create a personalized fitness challenge</CustomText>
              </View>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl ml-4`}
                onPress={() => {
                  setIsCustomChallengeModalVisible(false)
                  setChallengeTargetFriend(null)
                  setSendingChallenge(false)
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Activity Type Selection */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Activity Type
                </CustomText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
                  {activities.map((activity) => (
                    <TouchableOpacity
                      key={activity.id}
                      style={twrnc`mx-2 p-4 rounded-2xl items-center min-w-[100px] ${customChallenge.activityType === activity.id
                        ? `border-2 border-[${activity.color}]`
                        : "bg-[#2A2E3A]"
                        }`}
                      onPress={() => updateChallengeActivity(activity.id)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          twrnc`w-12 h-12 rounded-2xl items-center justify-center mb-2`,
                          {
                            backgroundColor: customChallenge.activityType === activity.id ? activity.color : "#3A3F4B",
                          },
                        ]}
                      >
                        <Image
                          source={activity.icon}
                          style={{ width: 24, height: 24, tintColor: customChallenge.activityType === activity.id ? "#FFFFFF" : "#6B7280" }}
                          resizeMode="contain"
                        />
                      </View>
                      <CustomText
                        weight={customChallenge.activityType === activity.id ? "bold" : "medium"}
                        style={twrnc`text-white text-center text-sm`}
                      >
                        {activity.name}
                      </CustomText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Goal Selection */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Challenge Goal
                </CustomText>
                <View style={twrnc`flex-row items-center bg-[#2A2E3A] rounded-2xl px-4 py-3 mb-3`}>
                  <TextInput
                    style={twrnc`flex-1 text-white text-lg font-bold`}
                    value={String(customChallenge.goal)}
                    onChangeText={(text) => {
                      const numValue = Number.parseFloat(text) || 0
                      updateChallengeDescription(numValue, customChallenge.duration)
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                  />
                  <CustomText style={twrnc`text-gray-400 ml-2`}>
                    {activities.find((a) => a.id === customChallenge.activityType)?.unit || "units"}
                  </CustomText>
                </View>
                <View style={twrnc`flex-row flex-wrap`}>
                  {activities.find((a) => a.id === customChallenge.activityType)?.goalOptions?.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={twrnc`bg-[#3A3F4B] px-4 py-2 rounded-xl mr-2 mb-2 ${customChallenge.goal === option ? "bg-[#4361EE]" : ""
                        }`}
                      onPress={() => updateChallengeDescription(option, customChallenge.duration)}
                      activeOpacity={0.8}
                    >
                      <CustomText
                        weight={customChallenge.goal === option ? "bold" : "medium"}
                        style={twrnc`text-white text-sm`}
                      >
                        {option} {activities.find((a) => a.id === customChallenge.activityType)?.unit}
                      </CustomText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Difficulty Selection */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Difficulty Level
                </CustomText>
                <View style={twrnc`flex-row justify-between`}>
                  {DIFFICULTY_LEVELS.map((difficulty) => (
                    <TouchableOpacity
                      key={difficulty.id}
                      style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center ${customChallenge.difficulty === difficulty.id
                        ? `border-2 border-[${difficulty.color}]`
                        : "bg-[#2A2E3A]"
                        }`}
                      onPress={() => setCustomChallenge((prev) => ({ ...prev, difficulty: difficulty.id }))}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          twrnc`w-10 h-10 rounded-2xl items-center justify-center mb-2`,
                          {
                            backgroundColor:
                              customChallenge.difficulty === difficulty.id ? difficulty.color : "#3A3F4B",
                          },
                        ]}
                      >
                        <Ionicons
                          name={difficulty.icon}
                          size={20}
                          color={customChallenge.difficulty === difficulty.id ? "#FFFFFF" : "#6B7280"}
                        />
                      </View>
                      <CustomText
                        weight={customChallenge.difficulty === difficulty.id ? "bold" : "medium"}
                        style={twrnc`text-white text-center text-xs`}
                      >
                        {difficulty.name}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs mt-1`}>{difficulty.multiplier}x</CustomText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Duration Selection */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Duration
                </CustomText>
                <View style={twrnc`flex-row justify-between`}>
                  {[3, 7, 14, 30].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center ${customChallenge.duration === days ? "border-2 border-[#4361EE]" : "bg-[#2A2E3A]"
                        }`}
                      onPress={() => updateChallengeDescription(customChallenge.goal, days)}
                      activeOpacity={0.8}
                    >
                      <CustomText
                        weight={customChallenge.duration === days ? "bold" : "medium"}
                        style={twrnc`text-white text-center`}
                      >
                        {days}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs mt-1`}>{days === 1 ? "day" : "days"}</CustomText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Challenge Title */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Challenge Title
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base`}
                  placeholder="Enter challenge title"
                  placeholderTextColor="#6B7280"
                  value={customChallenge.title}
                  onChangeText={(text) => setCustomChallenge((prev) => ({ ...prev, title: text }))}
                />
              </View>

              {/* Challenge Description */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Description
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl h-20 text-base`}
                  placeholder="Enter challenge description"
                  placeholderTextColor="#6B7280"
                  multiline={true}
                  textAlignVertical="top"
                  value={customChallenge.description}
                  onChangeText={(text) => setCustomChallenge((prev) => ({ ...prev, description: text }))}
                />
              </View>

              {/* Challenge Preview */}
              <View style={twrnc`mb-8 bg-[#2A2E3A] rounded-2xl p-4`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Challenge Preview
                </CustomText>
                <View style={twrnc`flex-row items-center mb-2`}>
                  <View
                    style={[
                      twrnc`w-8 h-8 rounded-xl items-center justify-center mr-3`,
                      {
                        backgroundColor:
                          activities.find((a) => a.id === customChallenge.activityType)?.color || "#4361EE",
                      },
                    ]}
                  >
                    <Image
                      source={activities.find((a) => a.id === customChallenge.activityType)?.icon}
                      style={{ width: 16, height: 16, tintColor: "#FFFFFF" }}
                      resizeMode="contain"
                    />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                    {customChallenge.title}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-sm mb-3`}>{customChallenge.description}</CustomText>
                <View style={twrnc`flex-row justify-between`}>
                  <View style={twrnc`items-center`}>
                    <CustomText weight="semibold" style={twrnc`text-[#4361EE] text-lg`}>
                      {Math.round(
                        customChallenge.goal *
                        (DIFFICULTY_LEVELS.find((d) => d.id === customChallenge.difficulty)?.multiplier || 1),
                      )}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>
                      {activities.find((a) => a.id === customChallenge.activityType)?.unit}
                    </CustomText>
                  </View>
                  <View style={twrnc`items-center`}>
                    <CustomText weight="semibold" style={twrnc`text-[#FFC107] text-lg`}>
                      {customChallenge.duration}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>days</CustomText>
                  </View>
                  <View style={twrnc`items-center`}>
                    <CustomText weight="semibold" style={twrnc`text-[#EF476F] text-lg capitalize`}>
                      {customChallenge.difficulty}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>difficulty</CustomText>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={twrnc`flex-row justify-between mb-4`}>
                <TouchableOpacity
                  style={twrnc`bg-[#EF476F] py-4 px-6 rounded-2xl flex-1 mr-2 items-center`}
                  onPress={() => {
                    setIsCustomChallengeModalVisible(false)
                    setChallengeTargetFriend(null)
                    setSendingChallenge(false)
                  }}
                  activeOpacity={0.8}
                >
                  <CustomText weight="semibold" style={twrnc`text-white`}>
                    Cancel
                  </CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twrnc`${creatingChallenge ? "bg-[#3251DD]" : "bg-[#4361EE]"
                    } py-4 px-6 rounded-2xl flex-1 ml-2 items-center ${!customChallenge.title.trim() ? "opacity-50" : ""
                    }`}
                  onPress={handleCreateCustomChallenge}
                  disabled={creatingChallenge || !customChallenge.title.trim()}
                  activeOpacity={0.8}
                >
                  {creatingChallenge ? (
                    <View style={twrnc`flex-row items-center`}>
                      <ActivityIndicator size="small" color="white" style={twrnc`mr-2`} />
                      <CustomText weight="semibold" style={twrnc`text-white`}>
                        Creating...
                      </CustomText>
                    </View>
                  ) : (
                    <CustomText weight="semibold" style={twrnc`text-white`}>
                      Send Challenge
                    </CustomText>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Friend Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFriendProfileVisible}
        onRequestClose={() => setIsFriendProfileVisible(false)}
      >
        {selectedFriend && (
          <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
            <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-3/4`}>
              <View style={twrnc`flex-row justify-between items-center mb-6`}>
                <CustomText weight="bold" style={twrnc`text-white text-2xl`}>
                  Friend Profile
                </CustomText>
                <TouchableOpacity
                  style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                  onPress={() => setIsFriendProfileVisible(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={twrnc`items-center mb-8`}>
                  <View style={twrnc`relative mb-4`}>
                    <Image
                      source={{ uri: selectedFriend.avatar || DEFAULT_AVATAR }}
                      style={twrnc`w-28 h-28 rounded-3xl border-4 border-[#4361EE]`}
                    />
                    <View
                      style={twrnc`absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-4 border-[#121826] ${selectedFriend.isOnline ? "bg-green-500" : "bg-gray-500"
                        }`}
                    />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-white text-2xl mb-2`}>
                    {selectedFriend.displayName || selectedFriend.username || "User"}
                  </CustomText>
                  <View style={twrnc`flex-row items-center`}>
                    <View
                      style={twrnc`w-2 h-2 rounded-full mr-2 ${selectedFriend.isOnline ? "bg-green-500" : "bg-gray-500"}`}
                    />
                    <CustomText style={twrnc`text-gray-400`}>
                      {selectedFriend.isOnline ? "Online now" : "Offline"}
                    </CustomText>
                  </View>
                </View>

                <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-6`}>
                  <View style={twrnc`flex-row justify-between`}>
                    <View style={twrnc`items-center flex-1`}>
                      <View style={twrnc`w-12 h-12 rounded-2xl bg-[#FFC10720] items-center justify-center mb-2`}>
                        <Ionicons name="flame" size={24} color="#FFC107" />
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                        {selectedFriend.streak || 0}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>Day Streak</CustomText>
                    </View>
                    <View style={twrnc`items-center flex-1`}>
                      <View style={twrnc`w-12 h-12 rounded-2xl bg-[#4361EE20] items-center justify-center mb-2`}>
                        <Ionicons name="map-outline" size={24} color="#4361EE" />
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                        {selectedFriend.totalDistance ? selectedFriend.totalDistance.toFixed(1) : "0"}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>Total km</CustomText>
                    </View>
                    <View style={twrnc`items-center flex-1`}>
                      <View style={twrnc`w-12 h-12 rounded-2xl bg-[#06D6A020] items-center justify-center mb-2`}>
                        <Ionicons name="fitness-outline" size={24} color="#06D6A0" />
                      </View>
                      <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                        {selectedFriend.totalActivities || 0}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>Activities</CustomText>
                    </View>
                  </View>
                </View>

                <View style={twrnc`mb-6`}>
                  <CustomText weight="bold" style={twrnc`text-white text-xl mb-4`}>
                    Recent Activity
                  </CustomText>
                  {selectedFriend.lastActivity ? (
                    <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5`}>
                      <View style={twrnc`flex-row items-center mb-3`}>
                        <View style={twrnc`w-10 h-10 rounded-2xl bg-[#FFC10720] items-center justify-center mr-3`}>
                          <Ionicons
                            name={
                              selectedFriend.lastActivity.activityType === "running"
                                ? "walk-outline"
                                : selectedFriend.lastActivity.activityType === "cycling"
                                  ? "bicycle-outline"
                                  : "walk-outline"
                            }
                            size={20}
                            color="#FFC107"
                          />
                        </View>
                        <View style={twrnc`flex-1`}>
                          <CustomText weight="semibold" style={twrnc`text-white text-lg`}>
                            {selectedFriend.lastActivity.activityType?.charAt(0).toUpperCase() +
                              selectedFriend.lastActivity.activityType?.slice(1) || "Activity"}
                          </CustomText>
                          <CustomText style={twrnc`text-gray-400 text-sm`}>
                            {selectedFriend.lastActivity.createdAt
                              ? formatLastActive(selectedFriend.lastActivity.createdAt)
                              : ""}
                          </CustomText>
                        </View>
                      </View>
                      <View style={twrnc`flex-row justify-between pt-3 border-t border-[#3A3F4B]`}>
                        <View style={twrnc`items-center`}>
                          <CustomText weight="semibold" style={twrnc`text-[#4361EE] text-lg`}>
                            {typeof selectedFriend.lastActivity.distance === "number" &&
                              !isNaN(selectedFriend.lastActivity.distance)
                              ? selectedFriend.lastActivity.distance.toFixed(2)
                              : "0"}
                          </CustomText>
                          <CustomText style={twrnc`text-gray-400 text-xs`}>km</CustomText>
                        </View>
                        <View style={twrnc`items-center`}>
                          <CustomText weight="semibold" style={twrnc`text-[#06D6A0] text-lg`}>
                            {selectedFriend.lastActivity.duration
                              ? formatTime(selectedFriend.lastActivity.duration)
                              : "0:00"}
                          </CustomText>
                          <CustomText style={twrnc`text-gray-400 text-xs`}>Duration</CustomText>
                        </View>
                        <View style={twrnc`items-center`}>
                          <CustomText weight="semibold" style={twrnc`text-[#FFC107] text-lg`}>
                            {selectedFriend.lastActivity.pace ? formatTime(selectedFriend.lastActivity.pace) : "0:00"}
                          </CustomText>
                          <CustomText style={twrnc`text-gray-400 text-xs`}>Pace/km</CustomText>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-8 items-center`}>
                      <View style={twrnc`w-16 h-16 rounded-3xl bg-[#6B728020] items-center justify-center mb-4`}>
                        <Ionicons name="fitness-outline" size={32} color="#6B7280" />
                      </View>
                      <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                        No Recent Activity
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-center`}>
                        This friend hasn't recorded any activities yet
                      </CustomText>
                    </View>
                  )}
                </View>

                <View style={twrnc`flex-row justify-between`}>
                  <TouchableOpacity
                    style={twrnc`${sendingChallenge ? "bg-[#3251DD]" : "bg-[#4361EE]"
                      } rounded-2xl py-4 px-6 flex-1 mr-2 items-center`}
                    onPress={sendChallengeToFriend}
                    disabled={sendingChallenge}
                    activeOpacity={0.8}
                  >
                    {sendingChallenge ? (
                      <>
                        <ActivityIndicator size="small" color="white" style={twrnc`mb-1`} />
                        <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                          Opening...
                        </CustomText>
                      </>
                    ) : (
                      <>
                        <Ionicons name="trophy-outline" size={20} color="white" style={twrnc`mb-1`} />
                        <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                          Challenge
                        </CustomText>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={twrnc`${sendingQuickMessage ? "bg-[#1F2330]" : "bg-[#2A2E3A]"
                      } rounded-2xl py-4 px-6 flex-1 ml-2 items-center`}
                    onPress={() => handleOpenQuickChat(selectedFriend)}
                    disabled={sendingQuickMessage}
                    activeOpacity={0.8}
                  >
                    {sendingQuickMessage ? (
                      <>
                        <ActivityIndicator size="small" color="white" style={twrnc`mb-1`} />
                        <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                          Opening...
                        </CustomText>
                      </>
                    ) : (
                      <>
                        <Ionicons name="chatbubble-outline" size={20} color="white" style={twrnc`mb-1`} />
                        <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                          Quick Chat
                        </CustomText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      <ChallengeDetailsModal
        isVisible={isChallengeDetailsVisible}
        onClose={() => setIsChallengeDetailsVisible(false)}
        selectedChallenge={selectedChallenge}
        auth={auth}
        activities={activities}
        joiningChallenges={joiningChallenges}
        handleJoinChallenge={handleJoinChallenge}
        navigateToActivityWithChallenge={navigateToActivityWithChallenge}
        handleEditChallenge={handleEditChallenge}
        handleDeleteChallenge={handleDeleteChallenge}
        creatingChallenge={creatingChallenge}
      />

      {/* Edit Challenge Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditChallengeModalVisible}
        onRequestClose={() => {
          setIsEditChallengeModalVisible(false);
          setSelectedChallenge(null);
          setCreatingChallenge(false);
        }}
      >
        <TouchableOpacity
          style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}
          activeOpacity={1}
          onPress={() => {
            setIsEditChallengeModalVisible(false);
            setSelectedChallenge(null);
            setCreatingChallenge(false);
          }}
        >
          <TouchableOpacity
            style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-2/3`}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()} // Prevent click from propagating to background
          >
            {/* Header */}
            <View style={twrnc`flex-row justify-between items-center mb-6`}>
              <CustomText weight="bold" style={twrnc`text-white text-2xl`}>
                Edit Challenge
              </CustomText>
              <TouchableOpacity
                style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
                onPress={() => {
                  setIsEditChallengeModalVisible(false);
                  setSelectedChallenge(null);
                  setCreatingChallenge(false);
                }}
                disabled={creatingChallenge}
                activeOpacity={0.8}
              >
                {creatingChallenge ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Challenge Type (Read-only) */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Challenge Type
                </CustomText>
                <View style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl opacity-50`}>
                  <CustomText style={twrnc`text-white text-center`}>
                    {CHALLENGE_GROUP_TYPES.find(t => t.id === newChallenge.groupType)?.name || "Public"}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-sm mt-2 text-center`}>
                  Challenge type cannot be changed after creation
                </CustomText>
              </View>

              {/* Participants Info (Read-only) */}
              {newChallenge.groupType !== "public" && (
                <View style={twrnc`mb-6`}>
                  <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                    Participants
                  </CustomText>
                  <View style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl opacity-50`}>
                    <CustomText style={twrnc`text-white text-center`}>
                      {selectedChallenge?.participants?.length || 1} / {newChallenge.groupType === "duo" ? 2 : CHALLENGE_GROUP_TYPES.find(t => t.id === "lobby").maxParticipants} participants
                    </CustomText>
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-sm mt-2 text-center`}>
                    Participants cannot be changed after creation
                  </CustomText>
                </View>
              )}

              {/* Challenge Title */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Challenge Title
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base`}
                  placeholder="Enter challenge title"
                  placeholderTextColor="#6B7280"
                  value={newChallenge.title}
                  onChangeText={(text) => setNewChallenge({ ...newChallenge, title: text })}
                  editable={!creatingChallenge}
                />
              </View>

              {/* Description */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Description
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl h-24 text-base`}
                  placeholder="Enter challenge description"
                  placeholderTextColor="#6B7280"
                  multiline={true}
                  textAlignVertical="top"
                  value={newChallenge.description}
                  onChangeText={(text) => setNewChallenge({ ...newChallenge, description: text })}
                  editable={!creatingChallenge}
                />
              </View>

              {/* Activity Type (Read-only) */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Activity Type
                </CustomText>
                <View style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl opacity-50`}>
                  <CustomText style={twrnc`text-white text-center`}>
                    {activities.find(a => a.id === newChallenge.type)?.name || "Walking"}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-sm mt-2 text-center`}>
                  Activity type cannot be changed after creation
                </CustomText>
              </View>

              {/* Goal Selection */}
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Goal ({newChallenge.unit})
                </CustomText>
                <View style={twrnc`flex-row justify-between`}>
                  {activities.find(act => act.id === newChallenge.type)?.goalOptions?.map((goalOption) => (
                    <TouchableOpacity
                      key={goalOption}
                      style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl flex-1 mx-1 items-center ${newChallenge.goal === goalOption ? "border-2 border-[#06D6A0]" : ""} ${creatingChallenge ? "opacity-50" : ""}`}
                      onPress={() => !creatingChallenge && setNewChallenge({ ...newChallenge, goal: goalOption })}
                      disabled={creatingChallenge}
                      activeOpacity={0.8}
                    >
                      <CustomText
                        weight={newChallenge.goal === goalOption ? "bold" : "medium"}
                        style={twrnc`text-white text-center ${creatingChallenge ? "opacity-50" : ""}`}
                      >
                        {goalOption} {newChallenge.unit}
                      </CustomText>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base mt-3 ${creatingChallenge ? "opacity-50" : ""}`}
                  placeholder="Enter custom goal"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                  value={String(newChallenge.goal)}
                  onChangeText={(text) => !creatingChallenge && setNewChallenge({ ...newChallenge, goal: Number(text) || 0 })}
                  editable={!creatingChallenge}
                />
              </View>

              {/* Difficulty Selection */}
              <View style={twrnc`mb-8`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  Difficulty
                </CustomText>
                <View style={twrnc`flex-row justify-between`}>
                  {["Easy", "Medium", "Hard"].map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl flex-1 mx-1 items-center ${newChallenge.difficulty === level ? "border-2 border-[#FFC107]" : ""} ${creatingChallenge ? "opacity-50" : ""}`}
                      onPress={() => !creatingChallenge && setNewChallenge({ ...newChallenge, difficulty: level })}
                      disabled={creatingChallenge}
                      activeOpacity={0.8}
                    >
                      <CustomText
                        weight={newChallenge.difficulty === level ? "bold" : "medium"}
                        style={twrnc`text-white text-center ${creatingChallenge ? "opacity-50" : ""}`}
                      >
                        {level}
                      </CustomText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Duration */}
              <View style={twrnc`mb-8`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                  End Date
                </CustomText>
                <TextInput
                  style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base opacity-50`}
                  value={newChallenge.endDate.toLocaleDateString()}
                  editable={false}
                />
                <CustomText style={twrnc`text-gray-400 text-sm mt-2 text-center`}>
                  End date cannot be changed after creation
                </CustomText>
              </View>

              {/* Update Button */}
              <TouchableOpacity
                style={twrnc`${creatingChallenge ? "bg-[#3251DD]" : "bg-[#4361EE]"} p-4 rounded-2xl flex-row justify-center items-center`}
                onPress={handleSaveChallenge}
                disabled={creatingChallenge}
                activeOpacity={0.8}
              >
                {creatingChallenge ? (
                  <>
                    <ActivityIndicator size="small" color="white" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-white`}>Updating...</CustomText>
                  </>
                ) : (
                  <CustomText weight="bold" style={twrnc`text-white`}>Update Challenge</CustomText>
                )}
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={twrnc`${creatingChallenge ? "bg-[#7F1D1D80]" : "bg-[#EF476F]"} p-4 rounded-2xl flex-row justify-center items-center mt-4`}
                onPress={() => {
                  if (!creatingChallenge) {
                    setIsEditChallengeModalVisible(false);
                    setSelectedChallenge(null);
                    setCreatingChallenge(false);
                  }
                }}
                disabled={creatingChallenge}
                activeOpacity={0.8}
              >
                {creatingChallenge ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <CustomText weight="bold" style={twrnc`text-white`}>Cancel</CustomText>
                )}
              </TouchableOpacity>

            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>


      {/* QuickChat Input at the bottom */}
      {isQuickChatVisible && quickChatSelectedFriend && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={twrnc`absolute bottom-0 left-0 right-0 bg-[#1A1F2E] p-4 border-t border-[#2A3447]`}
        >
          <View style={twrnc`flex-row items-center mb-3`}>
            <Image
              source={{ uri: quickChatSelectedFriend.avatar || DEFAULT_AVATAR }}
              style={twrnc`w-8 h-8 rounded-full mr-2`}
            />
            <CustomText weight="bold" style={twrnc`text-white text-base`}>
              Chatting with {quickChatSelectedFriend.displayName || quickChatSelectedFriend.username}
            </CustomText>
            <TouchableOpacity
              onPress={() => setIsQuickChatVisible(false)}
              style={twrnc`ml-auto p-1 rounded-full bg-[#2A2E3A]`}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={twrnc`flex-row items-end`}>
            <View style={twrnc`flex-1 bg-[#2A2E3A] rounded-2xl px-4 py-3 mr-3`}>
              <TextInput
                style={twrnc`text-white text-base max-h-24`}
                placeholder="Type a quick message..."
                placeholderTextColor="#6B7280"
                value={quickChatMessage}
                onChangeText={setQuickChatMessage}
                multiline
                editable={!sendingQuickMessage}
              />
            </View>
            <TouchableOpacity
              style={twrnc`${sendingQuickMessage ? "bg-[#3251DD]" : "bg-[#4361EE]"
                } w-12 h-12 rounded-2xl items-center justify-center ${!quickChatMessage.trim() ? "opacity-50" : ""}`}
              onPress={handleSendQuickMessage}
              disabled={!quickChatMessage.trim() || sendingQuickMessage}
              activeOpacity={0.8}
            >
              {sendingQuickMessage ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={20} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Offline Mode Indicator */}
      {offlineMode && (
        <View
          style={twrnc`absolute bottom-4 left-4 right-4 bg-[#FFC107] p-4 rounded-2xl flex-row items-center shadow-lg`}
        >
          <View style={twrnc`w-10 h-10 rounded-2xl bg-[#121826] items-center justify-center mr-3`}>
            <Ionicons name="cloud-offline-outline" size={20} color="#FFC107" />
          </View>
          <View style={twrnc`flex-1`}>
            <CustomText weight="bold" style={twrnc`text-[#121826] text-base`}>
              Offline Mode
            </CustomText>
            <CustomText style={twrnc`text-[#121826] text-sm`}>
              Last synced: {lastOnlineSync ? formatLastActive(lastOnlineSync) : "Never"}
            </CustomText>
          </View>
        </View>
      )}
    </View>
  )
}

export default CommunityScreen
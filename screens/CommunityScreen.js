"use client"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  FlatList,
  Dimensions,
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
import DuoVsModal from "../components/modals/DuoVsModal"
import SquadVsModal from "../components/modals/SquadVsModal"
import WinnerModal from "../components/WinnerModal"
import AddFriendModal from "../components/modals/AddFriendModal"
import FriendProfileModal from "../components/modals/FriendProfileModal"
import EditChallengeModal from "../components/modals/EditChallengeModal"

// Icon imports
import WalkingIcon from "../components/icons/walking.png"
import RunningIcon from "../components/icons/running.png"
import CyclingIcon from "../components/icons/cycling.png"
import JoggingIcon from "../components/icons/jogging.png"
import PushupIcon from "../components/icons/pushup.png"

// Backend function imports
import {
  CHALLENGE_GROUP_TYPES,
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
  joinChallenge,
  startChallenge,
  loadLeaderboardData,
  setUserOnlineStatus,
  setUserOfflineStatus,
  formatTime,
  formatLastActive,
  formatActivityDescription,
  deleteChallenge,
  acceptChallengeInvite,
  loadPastChallenges,
} from "../utils/CommunityBackend"

import { getActivityDisplayInfo } from "../utils/activityDisplayMapper"

// Firebase imports
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"

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

const CommunityScreen = ({ navigateToDashboard, navigateToActivity, navigateToProfile, params = {} }) => {
  // --- STATE HOOKS (Must be unconditional) ---
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
  const [isEditChallengeModalVisible, setIsEditChallengeModalVisible] = useState(false)
  const [participantsData, setParticipantsData] = useState({}) // User data for challenge participants
  const [showVsModal, setShowVsModal] = useState(false)
  const [startingChallenge, setStartingChallenge] = useState(false)
  const [vsModalData, setVsModalData] = useState({ visible: false })
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
    groupType: "duo",
    selectedFriendsForGroupChallenge: [],
    stakeXP: 100,
  })

  const [friendsPage, setFriendsPage] = useState(1)
  const [hasMoreFriends, setHasMoreFriends] = useState(true)
  const [loadingMoreFriends, setLoadingMoreFriends] = useState(false)
  const [pastChallenges, setPastChallenges] = useState([]) // History tab data

  const [sendingFriendRequests, setSendingFriendRequests] = useState({})
  const [processingRequests, setProcessingRequests] = useState({})
  const [joiningChallenges, setJoiningChallenges] = useState({})
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [creatingChallenge, setCreatingChallenge] = useState(false)

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

  const [showSquadModal, setShowSquadModal] = useState(false);
  const [squadModalData, setSquadModalData] = useState({ participants: [], stakeXP: 0 });

  const [isWinnerModalVisible, setIsWinnerModalVisible] = useState(false);
  const [finalizationData, setFinalizationData] = useState(null);

  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [isChallengeDetailsVisible, setIsChallengeDetailsVisible] = useState(false)

  // --- MEMOIZED VALUES (Must be unconditional) ---

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
        unit: "km",
        defaultGoal: 5,
        goalOptions: [5, 10, 15, 20],
      },
      {
        id: "running",
        name: "Running",
        icon: RunningIcon,
        met: 8.0,
        color: "#EF476F",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        unit: "km",
        defaultGoal: 3,
        goalOptions: [3, 5, 7, 10],
      },
      {
        id: "cycling",
        name: "Cycling",
        icon: CyclingIcon,
        met: 6.0,
        color: "#06D6A0",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        unit: "km",
        defaultGoal: 10,
        goalOptions: [10, 20, 30, 40],
      },
      {
        id: "jogging",
        name: "Jogging",
        icon: JoggingIcon,
        met: 7.0,
        color: "#FFC107",
        iconColor: "#FFFFFF",
        isGpsActivity: true,
        unit: "km",
        defaultGoal: 4,
        goalOptions: [4, 6, 8, 12],
      },
      {
        id: "pushup",
        name: "Push-ups",
        icon: PushupIcon,
        met: 3.8,
        color: "#9B5DE5",
        iconColor: "#FFFFFF",
        isGpsActivity: false,
        unit: "reps",
        defaultGoal: 20,
        goalOptions: [10, 20, 30, 50],
      },
    ],
    [],
  )

  const currentUserLeaderboard = useMemo(
    () => leaderboard.find((user) => user.isCurrentUser),
    [leaderboard]
  );

  // --- UTILITY FUNCTIONS ---

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

  const debouncedSearchQuery = useDebounce(searchQuery, 500)

  const unsubscribersRef = useRef([])
  const lastOnlineUpdateRef = useRef(0)
  const friendsPerPage = 5

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
    {
      id: "history",
      label: "History",
      icon: "time-outline",
      color: "#9B5DE5",
      bgColor: "#9B5DE520",
      count: pastChallenges.length || 0,
    },
  ]

  // --- USE EFFECTS ---

  useEffect(() => {
    if (userProfile?.id) {
      loadPastChallenges(userProfile.id)
        .then((challenges) => {
          setPastChallenges(challenges || [])
        })
        .catch((error) => {
          console.error("Failed to load past challenges:", error)
          setPastChallenges([])
        })
    } else {
      setPastChallenges([])
    }
  }, [userProfile?.id])

  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        await NotificationService.initialize()
      } catch (error) {
        console.error("Error initializing NotificationService:", error)
      }
    }
    initializeNotifications()
    return () => {
      const user = auth.currentUser
      if (user) {
        NotificationService.cleanup(user.uid)
      }
    }
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return
    const updateOnlineStatus = async () => {
      try {
        const now = Date.now()
        // Update online status every 15 minutes
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


  const handleFinalize = async (challengeId) => {
    try {
      const result = await finalizeTimeChallenge(challengeId);

      if (result.success) {
        setFinalizationData(result);
        setIsWinnerModalVisible(true); // Open the new styled modal
      } else {
        // Only use generic alert for "Already completed" notices
        showModal({ title: "Status", message: result.message, type: "info" });
      }
    } catch (err) {
      showModal({ title: "Error", message: err.message, type: "error" });
    }
  };

  const fetchParticipantsData = useCallback(async () => {
    if (!selectedChallenge) {
      setParticipantsData({});
      return;
    }

    if (Array.isArray(selectedChallenge.participants) && selectedChallenge.participants.length > 0) {
      const users = {};
      for (const uid of selectedChallenge.participants) {
        try {
          const userDoc = await db.collection("users").doc(uid).get();
          if (userDoc.exists) {
            users[uid] = userDoc.data();
          } else {
            users[uid] = { displayName: "Player", avatar: DEFAULT_AVATAR, xp: 0 };
          }
        } catch (e) {
          users[uid] = { displayName: "Player", avatar: DEFAULT_AVATAR, xp: 0 };
        }
      }
      setParticipantsData(users);
    } else {
      setParticipantsData({});
    }
  }, [selectedChallenge]);

  const fetchParticipantsDataForChallenge = async (challenge) => {
    if (!challenge || !Array.isArray(challenge.participants) || challenge.participants.length === 0) {
      setParticipantsData({});
      return;
    }

    const users = {};
    for (const uid of challenge.participants) {
      try {
        const userDocRef = doc(db, "users", uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          users[uid] = userDoc.data();
        } else {
          users[uid] = { displayName: "Player", avatar: DEFAULT_AVATAR, xp: 0 };
        }
      } catch (e) {
        console.error("Error fetching user:", uid, e);
        users[uid] = { displayName: "Player", avatar: DEFAULT_AVATAR, xp: 0 };
      }
    }
    setParticipantsData(users);
  };


  useEffect(() => {
    fetchParticipantsData()
  }, [fetchParticipantsData])

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
      } else if (activeTab === "history") {
        if (userProfile?.id) {
          try {
            const updatedChallenges = await loadPastChallenges(userProfile.id)
            setPastChallenges(updatedChallenges || [])
          } catch (error) {
            console.error("Failed to refresh past challenges:", error)
            setPastChallenges([])
          }
        }
      }
    } catch (err) {
      console.error("Error refreshing data:", err)
    } finally {
      setRefreshing(false)
    }
  }, [activeTab, userProfile?.friends, userProfile?.id])

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
    if (!timestamp) return null
    if (timestamp.toDate && typeof timestamp.toDate === "function") {
      return timestamp.toDate()
    }
    if (timestamp instanceof Date) {
      return timestamp
    }
    const parsedDate = new Date(timestamp)
    if (!isNaN(parsedDate)) return parsedDate
    return null
  }

  useEffect(() => {
    return () => {
      // Cleanup modal states on unmount
      setIsChallengeDetailsVisible(false)
      setIsEditChallengeModalVisible(false)
      setSelectedChallenge(null)
      setCreatingChallenge(false)
    }
  }, [])

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery) {
        try {
          setSearchLoading(true)
          const results = await searchUsers(debouncedSearchQuery)
          setSearchResults(results)
        } catch (err) {
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

  const handleAcceptChallenge = async (challengeId) => {
    try {
      setJoiningChallenges((prev) => ({ ...prev, [challengeId]: true }))
      const result = await acceptChallengeInvite(challengeId)
      const userId = auth.currentUser?.uid

      // Manually update the local 'challenges' state after accepting invite
      setChallenges((prevChallenges) =>
        prevChallenges.map((challenge) => {
          if (challenge.id === challengeId) {
            const newParticipants = (challenge.participants || []).includes(userId)
              ? challenge.participants
              : [...(challenge.participants || []), userId]
            const newInvitedUsers = (challenge.invitedUsers || []).filter((id) => id !== userId)

            return {
              ...challenge,
              participants: newParticipants,
              invitedUsers: newInvitedUsers,
            }
          }
          return challenge
        }),
      )
      showModal({ title: "Success", message: result.message, type: "success" })
    } catch (err) {
      showModal({ title: "Error", message: err.message, type: "error" })
    } finally {
      setJoiningChallenges((prev) => ({ ...prev, [challengeId]: false }))
    }
  }

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
    // Mark request as processing
    setProcessingRequests(prev => ({
      ...prev,
      [requestId]: "accepting",
    }))

    try {
      // Accept request
      const { message } = await acceptFriendRequest(requestId, fromUserId, {
        setFriendRequests,
        setUserProfile,
        setFriends,
      })

      // Show success modal
      showModal({
        title: "Success",
        message,
        type: "success",
      })

    } catch (err) {
      // Error handling
      showModal({
        title: "Error",
        message: err?.message || "Something went wrong.",
        type: "error",
      })

    } finally {
      // Always clear processing state
      setProcessingRequests(prev => ({
        ...prev,
        [requestId]: null,
      }))
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

  const handleStartChallenge = async (challengeId) => {
    try {
      setCreatingChallenge(true)

      await startChallenge(challengeId)

      // Update local state to active
      setChallenges((prev) =>
        prev.map((challenge) =>
          challenge.id === challengeId
            ? { ...challenge, status: { ...challenge.status, global: "active" }, startDate: new Date() }
            : challenge,
        ),
      )

      setSelectedChallenge((prev) =>
        prev && prev.id === challengeId
          ? { ...prev, status: { ...prev.status, global: "active" }, startDate: new Date() }
          : prev,
      )

      showModal({
        title: "Challenge Started",
        message: "Your challenge is now active!",
        type: "success",
      })
    } catch (err) {
      console.error("Failed to start challenge:", err)

      // Rollback UI if start failed
      setSelectedChallenge((prev) =>
        prev && prev.id === challengeId ? { ...prev, status: { ...prev.status, global: "pending" } } : prev,
      )

      showModal({
        title: "Error",
        message: err?.message || "Failed to start challenge. Please try again.",
        type: "error",
      })
    } finally {
      setCreatingChallenge(false)
    }
  }

  const handleViewChallenge = async (challenge) => {
    setSelectedChallenge(challenge)

    // Ensure participants data is loaded first
    if (
      !participantsData[challenge.createdBy] ||
      !participantsData[challenge.participants?.find((p) => p !== challenge.createdBy)]
    ) {
      await fetchParticipantsData()
    }

    setIsChallengeDetailsVisible(true)
  }

  const handleShowDuoVs = ({ challengeId, player1, player2, stakeXP, fullChallenge }) => {
    setVsModalData({ challengeId, player1, player2, stakeXP, fullChallenge })
    setShowVsModal(true)
  }

  const handleCreateChallenge = async () => {
    try {
      if (!newChallenge.title.trim()) {
        showModal({
          title: "Error",
          message: "Please enter a challenge title",
          type: "error",
        })
        return
      }

      const selectedFriendsCount = newChallenge.selectedFriendsForGroupChallenge?.length || 0
      if (newChallenge.groupType === "duo" && selectedFriendsCount !== 1) {
        showModal({
          title: "Error",
          message: "Duo challenges require exactly one friend.",
          type: "error",
        })
        return
      }

      if (newChallenge.groupType === "lobby" && selectedFriendsCount < 2) {
        showModal({
          title: "Error",
          message: "Squad challenges require at least 2 friends.",
          type: "error",
        })
        return
      }

      // Validation for Race Challenges (Duo/Lobby)
      if (newChallenge.groupType === 'duo' || newChallenge.groupType === 'lobby') {
        if (!newChallenge.durationMinutes || newChallenge.durationMinutes < 1) {
          showModal({
            title: 'Error',
            message: 'Race challenges need at least 1 minute duration',
            type: 'error',
          });
          return;
        }
      }

      setCreatingChallenge(true)

      const result = await createChallenge(
        newChallenge,
        newChallenge.selectedFriendsForGroupChallenge?.map((f) => f.id) || [],
        newChallenge.groupType,
      )

      setIsCreateChallengeModalVisible(false)

      showModal({
        title: "Success",
        message: result.message,
        type: "success",
      })

      // Reset newChallenge state
      setNewChallenge({
        title: "",
        description: "",
        type: "walking",
        goal: 5,
        unit: "km",
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        durationMinutes: 30,
        groupType: "duo",
        selectedFriendsForGroupChallenge: [],
        stakeXP: 100,
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

  const viewFriendProfile = (friend) => {
    setSelectedFriend(friend)
    setIsFriendProfileVisible(true)
  }

  const viewChallengeDetails = (challenge) => {
    setSelectedChallenge(challenge)
    setIsChallengeDetailsVisible(true)
  }

  const navigateToActivityWithChallenge = (challenge, skipAnimation = false) => {
    const userId = auth.currentUser?.uid
    const userProgressAbsolute = challenge.progress?.[userId] || 0

    const challengeData = {
      questId: challenge.id,
      title: challenge.title,
      description: challenge.description,
      goal: challenge.mode === "time" ? null : Number(challenge.goal) || 1,
      unit: challenge.unit,
      activityType: challenge.activityType || challenge.type,
      stakeXP: challenge.stakeXP,
      difficulty: challenge.difficulty || "medium",
      category: "challenge",
      progress: challenge.mode === "time" ? 0 : Math.min(userProgressAbsolute / (challenge.goal || 1), 1),
      status: challenge.status?.[userId] || "not_started",
      mode: challenge.mode,
      durationMinutes: challenge.durationMinutes,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      xpReward: challenge.xpReward,
      participants: challenge.participants,
      createdBy: challenge.createdBy,
      groupType: challenge.groupType,
    }

    // 1. Trigger VS modal for DUO challenges (1v1)
    if (!skipAnimation && challenge.groupType === "duo" && challenge.participants?.length === 2) {
      setSelectedChallenge(challenge)
      handleShowDuoVs({
        challengeId: challenge.id,
        player1: challenge.participants[0],
        player2: challenge.participants[1],
        stakeXP: challenge.stakeXP,
        fullChallenge: challenge,
      })
    }
    // 2. Trigger SQUAD modal for LOBBY challenges (3+ players)
    else if (!skipAnimation && challenge.groupType === "lobby") {
      setSquadModalData({
        challengeId: challenge.id,
        participants: challenge.participants,
        stakeXP: challenge.stakeXP,
        fullChallenge: challenge,
      })
      setShowSquadModal(true)
    }
    // 3. Navigate directly (Solo challenges, skipped animation, or fallback)
    else {
      navigateToActivity({ questData: challengeData })
      setIsChallengeDetailsVisible(false)
      setShowVsModal(false)
      setShowSquadModal(false) // Make sure to close Squad modal too
    }
  }

  useEffect(() => {
    if (isEditChallengeModalVisible) {
      setIsChallengeDetailsVisible(false)
    }
  }, [isEditChallengeModalVisible])

  const handleEditChallenge = (challenge) => {
    if (challenge.createdBy !== auth.currentUser?.uid) {
      showModal({
        title: "Permission Denied",
        message: "Only the creator can edit this challenge.",
        type: "error",
      })
      return
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
      durationMinutes: challenge.durationMinutes,
    })

    setSelectedChallenge(challenge)
    setIsChallengeDetailsVisible(false)
    setTimeout(() => setIsEditChallengeModalVisible(true), 100)
  }

  const handleSaveChallenge = async () => {
    try {
      if (selectedChallenge) {
        setCreatingChallenge(true);

        // Update existing challenge fields (ONLY title and description allowed by Firestore rules)
        const challengeRef = doc(db, 'challenges', selectedChallenge.id);
        await updateDoc(challengeRef, {
          title: newChallenge.title,
          description: newChallenge.description,
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
              }
              : c
          )
        );

        showModal({
          title: 'Success',
          message: 'Challenge updated successfully!',
          type: 'success',
        });
      }
    } catch (err) {
      console.error('Error saving challenge:', err);
      showModal({
        title: 'Error',
        message: err.message || 'Failed to update challenge.',
        type: 'error',
      });
    } finally {
      setCreatingChallenge(false);
      setSelectedChallenge(null);
      setIsEditChallengeModalVisible(false);
    }
  };


  const handleDeleteChallenge = async (challengeId) => {
    showModal({
      title: "Delete Challenge",
      message: "Are you sure you want to delete this challenge? This action cannot be undone.",
      type: "warning",
      showCancelButton: true,
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          setCreatingChallenge(true)

          const result = await deleteChallenge(challengeId)
          setChallenges((prev) => prev.filter((c) => c.id !== challengeId))
          setIsChallengeDetailsVisible(false)

          showModal({
            title: "Challenge Deleted",
            message: result.message,
            type: "success",
          })
        } catch (err) {
          console.error("Error deleting challenge:", err)
          showModal({
            title: "Error",
            message: err.message || "Failed to delete challenge. Please try again.",
            type: "error",
          })
        } finally {
          setCreatingChallenge(false)
        }
      },
      onCancel: () => {
        setModalVisible(false)
      },
    })
  }

  // Render functions
  const renderFriendItem = ({ item }) => (
    <TouchableOpacity
      style={[
        twrnc`bg-[#1F2937] rounded-3xl p-4 mb-3 overflow-hidden`,
        {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6
        }
      ]}
      onPress={() => viewFriendProfile(item)}
      activeOpacity={0.85}
    >
      {/* Decorative Background Element */}
      <View style={[
        twrnc`absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-5`,
        { backgroundColor: item.isOnline ? '#06D6A0' : '#6B7280' }
      ]} />

      <View style={twrnc`flex-row items-center`}>
        {/* Avatar Section with Enhanced Status */}
        <View style={twrnc`relative mr-4`}>
          {/* Glow effect for online users */}
          {item.isOnline && (
            <View
              style={[
                twrnc`absolute inset-0 rounded-2xl`,
                {
                  backgroundColor: '#06D6A0',
                  opacity: 0.2,
                  transform: [{ scale: 1.15 }]
                }
              ]}
            />
          )}

          <Image
            source={{ uri: item.avatar || DEFAULT_AVATAR }}
            style={[
              twrnc`w-16 h-16 rounded-2xl`,
              {
                borderWidth: 3,
                borderColor: item.isOnline ? '#06D6A0' : '#374151'
              }
            ]}
          />

          {/* Enhanced Status Indicator */}
          <View
            style={[
              twrnc`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-3 border-[#1F2937] items-center justify-center`,
              { backgroundColor: item.isOnline ? '#06D6A0' : '#6B7280' }
            ]}
          >
            <Ionicons
              name={item.isOnline ? "checkmark" : "moon"}
              size={12}
              color="#FFFFFF"
            />
          </View>
        </View>

        {/* Content Section */}
        <View style={twrnc`flex-1`}>
          {/* Name and Streak Row */}
          <View style={twrnc`flex-row items-center justify-between mb-2`}>
            <View style={twrnc`flex-1 mr-2`}>
              <CustomText weight="bold" style={twrnc`text-white text-base mb-0.5`} numberOfLines={1}>
                {item.displayName || item.username || "User"}
              </CustomText>
              <CustomText style={twrnc`text-gray-400 text-xs`}>
                {item.isOnline ? "🟢 Active now" : formatLastActive(item.lastSeen)}
              </CustomText>
            </View>

            {/* Streak Badge */}
            {item.streak > 0 && (
              <View
                style={[
                  twrnc`px-3 py-1.5 rounded-xl flex-row items-center`,
                  {
                    backgroundColor: '#FFC10720',
                    borderWidth: 1,
                    borderColor: '#FFC10740'
                  }
                ]}
              >
                <Ionicons name="flame" size={14} color="#FFC107" />
                <CustomText weight="bold" style={twrnc`text-[#FFC107] ml-1 text-sm`}>
                  {item.streak}
                </CustomText>
              </View>
            )}
          </View>

          {/* Last Activity Info */}
          <View
            style={[
              twrnc`flex-row items-center mb-3 px-2.5 py-1.5 rounded-lg`,
              { backgroundColor: '#111827' }
            ]}
          >
            <Ionicons name="time-outline" size={12} color="#9CA3AF" style={twrnc`mr-1.5`} />
            <CustomText style={twrnc`text-gray-400 text-xs flex-1`} numberOfLines={1}>
              {formatActivityDescription(item.lastActivity)}
            </CustomText>
          </View>

          {/* Stats Row with Icons */}
          <View style={twrnc`flex-row justify-between`}>
            {/* Distance */}
            <View style={twrnc`flex-1 items-center`}>
              <View
                style={[
                  twrnc`w-full py-2 rounded-xl items-center`,
                  { backgroundColor: '#4361EE15' }
                ]}
              >
                <View style={twrnc`flex-row items-center mb-0.5`}>
                  <Ionicons name="navigate" size={12} color="#4361EE" style={twrnc`mr-1`} />
                  <CustomText weight="bold" style={twrnc`text-[#4361EE] text-sm`}>
                    {item.totalDistance ? item.totalDistance.toFixed(1) : "0"}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-500 text-[10px] uppercase`}>
                  KM
                </CustomText>
              </View>
            </View>

            <View style={twrnc`w-2`} />

            {/* Activities */}
            <View style={twrnc`flex-1 items-center`}>
              <View
                style={[
                  twrnc`w-full py-2 rounded-xl items-center`,
                  { backgroundColor: '#06D6A015' }
                ]}
              >
                <View style={twrnc`flex-row items-center mb-0.5`}>
                  <Ionicons name="fitness" size={12} color="#06D6A0" style={twrnc`mr-1`} />
                  <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-sm`}>
                    {item.totalActivities || 0}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-500 text-[10px] uppercase`}>
                  Activities
                </CustomText>
              </View>
            </View>

            <View style={twrnc`w-2`} />

            {/* Level or XP */}
            <View style={twrnc`flex-1 items-center`}>
              <View
                style={[
                  twrnc`w-full py-2 rounded-xl items-center`,
                  { backgroundColor: '#9B5DE515' }
                ]}
              >
                <View style={twrnc`flex-row items-center mb-0.5`}>
                  <Ionicons name="trophy" size={12} color="#9B5DE5" style={twrnc`mr-1`} />
                  <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-sm`}>
                    {item.level || 1}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-500 text-[10px] uppercase`}>
                  Level
                </CustomText>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Decorative Bottom Accent */}
      <View style={twrnc`absolute bottom-0 left-0 right-0 h-1 rounded-b-3xl overflow-hidden`}>
        <View style={twrnc`flex-row h-full`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                twrnc`flex-1 h-full`,
                {
                  backgroundColor: item.isOnline ? '#06D6A0' : '#374151',
                  opacity: 0.3 - (i * 0.05)
                }
              ]}
            />
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );



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
    const userId = auth.currentUser?.uid

    const isFull = item.maxParticipants && item.participants?.length >= item.maxParticipants
    const isJoined = Array.isArray(item.participants) && item.participants.includes(userId)

    const isPublicChallenge = item.groupType === "public"

    // Handle invited users for private challenges
    const invitedUsersList = Array.isArray(item.invitedUsers)
      ? item.invitedUsers
      : Array.isArray(item.invited)
        ? item.invited
        : []

    const isCreator = item.createdBy === userId

    const userIsInvited = invitedUsersList.includes(userId)
    const canSeePrivateChallenge = isCreator || userIsInvited || isJoined
    if (!isPublicChallenge && !canSeePrivateChallenge) {
      return null
    }

    const canJoin = !isJoined && !isFull && isPublicChallenge
    const canAccept = !isJoined && !isFull && userIsInvited && !isPublicChallenge

    // Safely access progress and status
    const userProgress = item.progress?.[userId] ?? 0;

    const userStatus = item.status?.[userId] ?? "not_started"

    const activityConfig = activities.find((act) => act.id === item.activityType)
    const unitDisplay = activityConfig ? activityConfig.unit : item.unit || ""
    const activityColor = activityConfig?.color || "#FFC107"
    const activityIcon = activityConfig?.icon

    const getRemainingTime = () => {
      const endDate = getDateFromTimestamp(item.endDate)
      if (!endDate) return "N/A"

      const now = new Date()
      const diff = endDate - now
      if (diff < 0) return "Ended"

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 24) {
        const days = Math.floor(hours / 24)
        return `${days}d ${hours % 24}h`
      }
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }

    const remainingTime = getRemainingTime()

    const formatProgress = (progress, unit) => {
      if (unit === "reps" || unit === "sets") return Math.round(progress);

      if (progress < 1) {
        return progress.toFixed(2);
      }

      return progress.toFixed(1);
    };

    const isChallengeCompleted = item.status?.global === "completed" || remainingTime === "Ended"
    let displayStatus = userStatus.replace(/_/g, " ");

    if (isChallengeCompleted) {
      if (item.status?.global === "completed" && item.winnerId) {
        displayStatus = item.winnerId === userId ? "You Won" : "Lost";
      } else {
        displayStatus = "Challenge Ended";
      }
    }

    const winnerData = participantsData[item.winnerId] || {};
    const winnerName = winnerData.displayName || winnerData.username || "Unknown Player";
    const winnerAvatar = winnerData.avatar || DEFAULT_AVATAR;

    // Enhanced status logic
    const progressPercentage = item.goal
      ? Math.min(100, (userProgress / item.goal) * 100)
      : 0;

    let statusColor = "#9BA3AF";
    let statusIcon = "information-circle";
    let statusBg = "#374151";

    if (displayStatus.toLowerCase().includes("won")) {
      statusColor = "#FCD34D";
      statusIcon = "trophy";
      statusBg = "#FCD34D";
    } else if (displayStatus.toLowerCase().includes("lost")) {
      statusColor = "#F87171";
      statusIcon = "close-circle";
      statusBg = "#F87171";
    } else if (userStatus === "in_progress") {
      statusColor = "#60A5FA";
      statusIcon = "bar-chart";
      statusBg = "#60A5FA";
    } else if (userStatus === "completed") {
      statusColor = "#34D399";
      statusIcon = "checkmark-circle";
      statusBg = "#34D399";
    } else if (displayStatus.toLowerCase().includes("ended")) {
      statusColor = "#9BA3AF";
      statusIcon = "flag";
      statusBg = "#374151";
    }

    return (
      <TouchableOpacity
        style={[
          twrnc`bg-[#1F2937] rounded-3xl mb-5 overflow-hidden`,
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 10,
          }
        ]}
        onPress={() => handleViewChallenge(item)}
        activeOpacity={0.9}
      >
        {/* Colorful Top Strip with Pattern */}
        <View style={[twrnc`h-2`, { backgroundColor: activityColor }]}>
          <View style={[twrnc`h-full flex-row`]}>
            {[...Array(20)].map((_, i) => (
              <View
                key={i}
                style={[
                  twrnc`flex-1`,
                  { backgroundColor: i % 2 === 0 ? activityColor : `${activityColor}CC` }
                ]}
              />
            ))}
          </View>
        </View>

        <View style={twrnc`p-5`}>
          {/* Header Section with Bold Design */}
          <View style={twrnc`mb-4`}>
            <View style={twrnc`flex-row items-start mb-3`}>
              {/* Large Activity Icon */}
              <View
                style={[
                  twrnc`w-16 h-16 rounded-2xl items-center justify-center mr-3`,
                  {
                    backgroundColor: activityColor,
                    transform: [{ rotate: '5deg' }]
                  },
                ]}
              >
                {activityIcon ? (
                  <Image
                    source={activityIcon}
                    style={twrnc`w-10 h-10`}
                    resizeMode="contain"
                    tintColor="#FFFFFF"
                  />
                ) : (
                  <Ionicons name="fitness" size={28} color="#FFFFFF" />
                )}

                {/* Corner Badge */}
                {!isChallengeCompleted && isJoined && (
                  <View
                    style={[
                      twrnc`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full`,
                      { backgroundColor: '#10B981', borderWidth: 2, borderColor: '#1F2937' }
                    ]}
                  />
                )}
              </View>

              {/* Title and Quick Info */}
              <View style={twrnc`flex-1`}>
                <CustomText weight="bold" style={twrnc`text-white text-lg mb-2 leading-tight`}>
                  {item.title}
                </CustomText>

                {/* Colorful Tags with Opacity */}
                <View style={twrnc`flex-row items-center flex-wrap mb-2`}>
                  <View
                    style={[
                      twrnc`px-2.5 py-1.5 rounded-lg mr-2 mb-2`,
                      { backgroundColor: `${activityColor}20` }
                    ]}
                  >
                    <CustomText weight="bold" style={[twrnc`text-[10px] uppercase tracking-wide`, { color: activityColor }]}>
                      {activityConfig?.name || "Challenge"}
                    </CustomText>
                  </View>

                  <View style={twrnc`bg-[#10B98120] px-2.5 py-1.5 rounded-lg mr-2 mb-2`}>
                    <CustomText weight="bold" style={twrnc`text-[#10B981] text-[10px]`}>
                      {String(item.participants?.length || 0)}/{String(item.maxParticipants || "∞")}
                    </CustomText>
                  </View>

                  {item.groupType && item.groupType !== "public" && (
                    <View style={twrnc`bg-[#A855F720] px-2.5 py-1.5 rounded-lg mb-2`}>
                      <CustomText weight="bold" style={twrnc`text-[#A855F7] text-[10px] uppercase`}>
                        {item.groupType}
                      </CustomText>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Stats Cards Row with Opacity */}
            <View style={twrnc`flex-row flex-wrap -mx-1`}>
              {/* Time Card */}
              <View style={twrnc`w-1/3 px-1 mb-2`}>
                <View style={twrnc`bg-[#FBBF2420] rounded-xl p-2.5`}>
                  <CustomText style={twrnc`text-[#FBBF24] text-[9px] uppercase mb-0.5`}>
                    Time
                  </CustomText>
                  <CustomText weight="bold" style={twrnc`text-[#FBBF24] text-[11px]`}>
                    {isChallengeCompleted ? "DONE" : remainingTime}
                  </CustomText>
                </View>
              </View>

              {/* Goal Card */}
              {item.goal && (
                <View style={twrnc`w-1/3 px-1 mb-2`}>
                  <View style={twrnc`bg-[#34D39920] rounded-xl p-2.5`}>
                    <CustomText style={twrnc`text-[#34D399] text-[9px] uppercase mb-0.5`}>
                      Goal
                    </CustomText>
                    <CustomText weight="bold" style={twrnc`text-[#34D399] text-[11px]`}>
                      {String(item.goal)} {unitDisplay}
                    </CustomText>
                  </View>
                </View>
              )}

              {/* Difficulty Card */}
              {item.difficulty && (
                <View style={twrnc`w-1/3 px-1 mb-2`}>
                  <View style={twrnc`bg-[#F8717120] rounded-xl p-2.5`}>
                    <CustomText style={twrnc`text-[#F87171] text-[9px] uppercase mb-0.5`}>
                      Level
                    </CustomText>
                    <CustomText weight="bold" style={twrnc`text-[#F87171] text-[11px] uppercase`}>
                      {item.difficulty}
                    </CustomText>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Description with Border */}
          {item.description && (
            <View style={[
              twrnc`mb-4 p-3 rounded-xl bg-[#111827] border-l-4`,
              { borderLeftColor: activityColor }
            ]}>
              <CustomText style={twrnc`text-gray-300 text-xs leading-5`}>
                {item.description}
              </CustomText>
            </View>
          )}

          {/* Bold Progress Section */}
          {isJoined && (
            <View
              style={[
                twrnc`mb-4 p-4 rounded-xl bg-[#111827]`,
                { borderWidth: 2, borderColor: statusBg }
              ]}
            >
              {/* Header with Large Status */}
              <View style={twrnc`flex-row justify-between items-center mb-3`}>
                <View>
                  <CustomText style={twrnc`text-gray-400 text-[9px] uppercase tracking-widest mb-1`}>
                    YOUR STATUS
                  </CustomText>
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                    Performance
                  </CustomText>
                </View>

                <View
                  style={[
                    twrnc`px-3 py-2 rounded-xl`,
                    { backgroundColor: statusBg }
                  ]}
                >
                  <CustomText weight="bold" style={twrnc`text-white text-[10px] uppercase`}>
                    {displayStatus}
                  </CustomText>
                </View>
              </View>

              {/* Large Progress Display */}
              <View style={twrnc`mb-3`}>
                <View style={twrnc`flex-row items-end justify-between mb-2`}>
                  <View>
                    <CustomText style={twrnc`text-gray-500 text-[9px] uppercase tracking-widest mb-1`}>
                      CURRENT
                    </CustomText>
                    <View style={twrnc`flex-row items-baseline`}>
                      <CustomText
                        weight="bold"
                        style={[twrnc`text-3xl`, { color: statusColor }]}
                      >
                        {formatProgress(userProgress, unitDisplay)}
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-gray-400 text-sm ml-1`}>
                        {unitDisplay}
                      </CustomText>
                    </View>
                  </View>

                  {item.goal && (
                    <View style={twrnc`items-end`}>
                      <CustomText style={twrnc`text-gray-500 text-[9px] uppercase tracking-widest mb-1`}>
                        TARGET
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        {String(item.goal)}
                      </CustomText>
                    </View>
                  )}
                </View>

                {/* Chunky Progress Bar */}
                {item.goal && userProgress > 0 && (
                  <View>
                    <View style={twrnc`h-3 bg-[#1F2937] rounded-full overflow-hidden mb-2`}>
                      <View
                        style={[
                          twrnc`h-full`,
                          {
                            width: `${progressPercentage}%`,
                            backgroundColor: statusColor
                          }
                        ]}
                      />
                    </View>

                    <View style={twrnc`flex-row justify-between items-center`}>
                      <CustomText weight="bold" style={[twrnc`text-xs`, { color: statusColor }]}>
                        {progressPercentage.toFixed(0)}% COMPLETE
                      </CustomText>

                      {progressPercentage >= 100 && (
                        <View style={twrnc`bg-[#FBBF24] px-2.5 py-1 rounded-full`}>
                          <CustomText weight="bold" style={twrnc`text-[#78350F] text-[9px]`}>
                            GOAL REACHED
                          </CustomText>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Bold Action Buttons */}
          {isChallengeCompleted ? (
            <View
              style={twrnc`bg-[#374151] py-4 rounded-xl items-center`}
            >
              <CustomText weight="bold" style={twrnc`text-[#9BA3AF] text-sm uppercase tracking-wide`}>
                Challenge Ended
              </CustomText>
            </View>
          ) : isJoined ? (
            <View
              style={twrnc`bg-[#10B981] py-4 rounded-xl items-center`}
            >
              <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                You're In
              </CustomText>
            </View>
          ) : canAccept ? (
            <TouchableOpacity
              style={[
                twrnc`py-4 rounded-xl items-center`,
                {
                  backgroundColor: joiningChallenges[item.id] ? '#2563EB' : '#3B82F6',
                }
              ]}
              onPress={() => handleAcceptChallenge(item.id)}
              disabled={joiningChallenges[item.id]}
              activeOpacity={0.8}
            >
              {joiningChallenges[item.id] ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                  Accept Challenge
                </CustomText>
              )}
            </TouchableOpacity>
          ) : canJoin ? (
            <TouchableOpacity
              style={[
                twrnc`py-4 rounded-xl items-center`,
                {
                  backgroundColor: joiningChallenges[item.id] ? '#2563EB' : '#3B82F6',
                }
              ]}
              onPress={() => handleJoinChallenge(item.id)}
              disabled={joiningChallenges[item.id]}
              activeOpacity={0.8}
            >
              {joiningChallenges[item.id] ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                  Join Now
                </CustomText>
              )}
            </TouchableOpacity>
          ) : (
            <View
              style={twrnc`bg-[#374151] py-4 rounded-xl items-center`}
            >
              <CustomText weight="bold" style={twrnc`text-[#9BA3AF] text-sm uppercase tracking-wide`}>
                Invite Only
              </CustomText>
            </View>
          )}

          {/* Full Badge */}
          {isFull && !isJoined && !isChallengeCompleted && (
            <View
              style={twrnc`bg-[#EF4444] py-3 rounded-xl items-center mt-3`}
            >
              <CustomText weight="bold" style={twrnc`text-white text-xs uppercase tracking-wide`}>
                Full Capacity
              </CustomText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

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
              style={twrnc`${sendingFriendRequests[item.id] ? "bg-[#3251DD]" : "bg-[#4361EE]"} py-2 px-4 rounded-xl items-center`}
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
    const isActive = activeTab === tab.id

    return (
      <AnimatedButton
        key={tab.id}
        style={twrnc`flex-1 items-center justify-center py-2`}
        onPress={() => setActiveTab(tab.id)}
        activeOpacity={0.8}
      >
        <View style={twrnc`items-center justify-center`}>
          <View
            style={[
              twrnc`w-10 h-10 rounded-xl items-center justify-center mb-1.5`,
              { backgroundColor: isActive ? tab.bgColor : "#2A2E3A" },
            ]}
          >
            <Ionicons name={tab.icon} size={20} color={isActive ? tab.color : "#6B7280"} />

            {tab.count > 0 && (
              <View
                style={[
                  twrnc`absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center`,
                  { backgroundColor: tab.color },
                ]}
              >
                <CustomText weight="bold" style={twrnc`text-white text-[9px]`}>
                  {tab.count > 9 ? "9+" : tab.count}
                </CustomText>
              </View>
            )}
          </View>

          <CustomText
            weight={isActive ? "bold" : "medium"}
            style={twrnc`text-[10px] text-center ${isActive ? "text-white" : "text-gray-400"}`}
            numberOfLines={1}
          >
            {tab.label}
          </CustomText>
        </View>
      </AnimatedButton>
    )
  }

  useEffect(() => {
    if (selectedChallenge) {
      fetchParticipantsData();
    }
  }, [selectedChallenge?.id]);


  const renderPastChallengeItem = ({ item }) => {
    const activityConfig = activities.find((act) => act.id === item.activityType)
    const activityColor = activityConfig?.color || "#FFC107"
    const activityIcon = activityConfig?.icon
    const userId = auth.currentUser?.uid

    const formatDuration = (minutes) => {
      if (minutes < 60) return `${minutes} min`
      const hours = Math.floor(minutes / 60)
      const remainingMinutes = minutes % 60
      return `${hours}h ${remainingMinutes}m`
    }

    const getWinnerInfo = () => {
      if (item.winnerId) {
        const isCurrentUserWinner = item.winnerId === userId
        const winnerName = participantsData[item.winnerId]?.displayName || participantsData[item.winnerId]?.username || "Player"

        return {
          isCurrentUser: isCurrentUserWinner,
          name: winnerName,
          avatar: participantsData[item.winnerId]?.avatar || DEFAULT_AVATAR,
          winnerId: item.winnerId,
        }
      }

      if (!item.progress || !item.participants || item.participants.length === 0) {
        return null
      }

      let maxProgress = -1
      let winnerId = null

      item.participants.forEach((participantId) => {
        const progress = item.progress[participantId] || 0
        if (progress > maxProgress) {
          maxProgress = progress
          winnerId = participantId
        }
      })

      if (!winnerId || maxProgress === 0 || item.participants.filter(id => item.progress[id] === maxProgress).length > 1) {
        return null
      }

      const isCurrentUserWinner = winnerId === userId
      const winnerName = isCurrentUserWinner ? "You" : participantsData[winnerId]?.displayName || "Player"

      return {
        isCurrentUser: isCurrentUserWinner,
        name: winnerName,
        avatar: participantsData[winnerId]?.avatar || DEFAULT_AVATAR,
        winnerId: winnerId,
      }
    }

    const winnerInfo = getWinnerInfo()

    const getResultColor = () => {
      switch (item.result) {
        case "won":
          return "#06D6A0"
        case "lost":
          return "#EF4444"
        case "completed":
          return "#4361EE"
        case "expired":
        default:
          return "#6B7280"
      }
    }

    const getResultLabel = () => {
      switch (item.result) {
        case "won":
          return "Victory"
        case "lost":
          return "Defeat"
        case "completed":
          return "Completed"
        case "expired":
        default:
          if (winnerInfo) {
            return winnerInfo.isCurrentUser ? "Victory" : "Defeat"
          }
          return "Expired"
      }
    }

    const formatDate = (date) => {
      if (!date) return "N/A"
      try {
        let dateObj = date
        if (!(date instanceof Date)) {
          if (date?.toDate && typeof date.toDate === "function") {
            dateObj = date.toDate()
          } else {
            dateObj = new Date(date)
          }
        }
        if (isNaN(dateObj.getTime())) {
          return "N/A"
        }
        return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      } catch (e) {
        console.warn("[v0] Date formatting error:", e)
        return "N/A"
      }
    }

    const safeGoal = item.goal ?? 1
    const safeParticipants = item.participants ?? []

    const hasGoal = item.goal !== null && item.goal > 0

    const displayDuration = item.mode === 'time' ? item.durationMinutes : item.durationMinutes ?? 0
    const showDuration = displayDuration > 0


    return (
      <TouchableOpacity
        style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-4 shadow-lg`}
        onPress={async () => {
          // Close modal first if it's open to force a fresh load
          if (isChallengeDetailsVisible) {
            setIsChallengeDetailsVisible(false);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Set the selected challenge with fresh data
          setSelectedChallenge(item);

          // Fetch participants for THIS specific item directly
          await fetchParticipantsDataForChallenge(item);  // ✅ Pass item directly!

          // Open modal
          setIsChallengeDetailsVisible(true);
        }}

        activeOpacity={0.8}
      >
        <View style={twrnc`flex-row items-center mb-4`}>
          <View
            style={[
              twrnc`w-16 h-16 rounded-2xl items-center justify-center mr-4`,
              { backgroundColor: `${activityColor}` },
            ]}
          >
            {activityIcon ? (
              <Image source={activityIcon} style={twrnc`w-10 h-10`} resizeMode="contain" tintColor="#FFFFFF" />
            ) : (
              <Ionicons name="fitness" size={32} color="#FFFFFF" />
            )}
          </View>

          <View style={twrnc`flex-1`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
              {item.title || "Untitled Challenge"}
            </CustomText>

            <View style={twrnc`flex-row items-center mb-2`}>
              <View style={[twrnc`px-3 py-1 rounded-xl mr-2`, { backgroundColor: `${activityColor}20` }]}>
                <CustomText style={[twrnc`text-xs font-medium`, { color: activityColor }]}>
                  {activityConfig?.name || "Challenge"}
                </CustomText>
              </View>

              <View style={[twrnc`px-3 py-1 rounded-xl`, { backgroundColor: `${getResultColor()}20` }]}>
                <CustomText style={[twrnc`text-xs font-medium`, { color: getResultColor() }]}>
                  {getResultLabel()}
                </CustomText>
              </View>
            </View>

            <View style={twrnc`flex-row items-center flex-wrap`}>
              <View style={twrnc`flex-row items-center mr-3 mb-1`}>
                <Ionicons name="calendar-outline" size={14} color="#FFC107" />
                <CustomText style={twrnc`text-[#FFC107] text-xs ml-1`}>{formatDate(item.endDate)}</CustomText>
              </View>

              {/* Show duration */}
              {showDuration && (
                <View style={twrnc`flex-row items-center mr-3 mb-1`}>
                  <Ionicons name="time-outline" size={14} color="#06D6A0" />
                  <CustomText style={twrnc`text-[#06D6A0] text-xs ml-1`}>{formatDuration(displayDuration)}</CustomText>
                </View>
              )}
            </View>
          </View>
        </View>

        {winnerInfo && (
          <View style={twrnc`bg-[#06D6A020] rounded-xl p-3 mb-4 flex-row items-center`}>
            <Image
              source={{ uri: winnerInfo.avatar }}
              style={twrnc`w-10 h-10 rounded-full mr-3 border-2 border-[#06D6A0]`}
            />
            <View style={twrnc`flex-1`}>
              <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-sm`}>
                🏆 Winner
              </CustomText>
              <CustomText weight="semibold" style={twrnc`text-white text-base`}>
                {winnerInfo.name}
              </CustomText>
            </View>
            {winnerInfo.isCurrentUser && (
              <View style={twrnc`bg-[#06D6A0] px-3 py-1 rounded-full`}>
                <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                  YOU
                </CustomText>
              </View>
            )}
          </View>
        )}

        <View style={twrnc`flex-row justify-between items-center pt-4 border-t border-[#3A3F4B]`}>
          <View style={twrnc`items-center flex-1`}>
            <CustomText weight="semibold" style={twrnc`text-[#9B5DE5] text-sm`}>
              {item.stakeXP} XP
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-xs`}>Stake</CustomText>
          </View>
          <View style={twrnc`items-center flex-1`}>
            <CustomText weight="semibold" style={twrnc`text-[#FFC107] text-sm`}>
              {safeParticipants.length} / {item.maxParticipants || "∞"}
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-xs`}>Players</CustomText>
          </View>
          <View style={twrnc`items-center flex-1`}>
            <CustomText weight="semibold" style={[twrnc`text-sm`, { color: getResultColor() }]}>
              {item.result === "won" ? "✓" : item.result === "lost" ? "✗" : "∼"}
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-xs`}>Result</CustomText>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

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
      <CustomModal visible={modalVisible} onClose={() => setModalVisible(false)} {...modalProps} />

      {/* Enhanced Header */}
      <View style={[twrnc`px-5 pt-14`, { backgroundColor: "#1e293b" }]}>
        <View style={twrnc`flex-row justify-between items-center mb-3`}>
          {/* Back Button */}
          <TouchableOpacity
            onPress={navigateToDashboard}
            style={twrnc`bg-[#0f172a] p-2.5 rounded-xl`}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Title Section */}
          <View style={twrnc`flex-1 mx-4`}>
            <CustomText weight="bold" style={twrnc`text-white text-xl text-center`}>
              Community
            </CustomText>
            <CustomText style={twrnc`text-gray-400 text-xs text-center mt-0.5`}>
              {friends.length} friends • {challenges.length} challenges
            </CustomText>
          </View>

          {/* Add Friend Button */}
          <TouchableOpacity
            style={twrnc`bg-[#0f172a] p-2.5 rounded-xl`}
            onPress={() => setIsAddFriendModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>


      {/* Enhanced Tabs */}
      <View style={twrnc`px-5 mb-4 mt-4`}>
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
            {/* Enhanced Header with Gradient Background - Compact & Uniform */}
            <View style={twrnc`mb-6`}>
              <View
                style={[
                  twrnc`rounded-2xl p-3.5 overflow-hidden`,
                  { backgroundColor: '#1F2937' }
                ]}
              >
                {/* Decorative Background Pattern */}
                <View style={twrnc`absolute top-0 right-0 w-28 h-28 opacity-5`}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          twrnc`w-1/4 h-1/4 border border-[#4361EE]`,
                          { transform: [{ rotate: '45deg' }] }
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <View style={twrnc`flex-row justify-between items-center z-10`}>
                  <View style={twrnc`flex-1`}>
                    <View style={twrnc`flex-row items-center mb-0.5`}>
                      <View style={twrnc`w-1 h-5 bg-[#4361EE] rounded-full mr-2.5`} />
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        Friends
                      </CustomText>
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs ml-3.5`}>
                      {friends.length > 0
                        ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} connected`
                        : 'No friends yet'
                      }
                    </CustomText>
                  </View>

                  <TouchableOpacity
                    onPress={() => setIsAddFriendModalVisible(true)}
                    style={[
                      twrnc`px-3.5 py-2 rounded-xl flex-row items-center shadow-lg`,
                      { backgroundColor: '#4361EE' }
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person-add" size={14} color="#FFFFFF" style={twrnc`mr-1.5`} />
                    <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                      Add
                    </CustomText>
                  </TouchableOpacity>
                </View>
              </View>
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
              /* Enhanced Empty State - Compact & Uniform */
              <View style={twrnc`bg-[#1F2937] rounded-3xl p-6 items-center overflow-hidden relative`}>
                {/* Decorative Circles Background - FIXED */}
                <View style={[
                  twrnc`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#4361EE' }
                ]} />
                <View style={[
                  twrnc`absolute -bottom-10 -left-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#4361EE' }
                ]} />

                {/* Icon Container with Pulse Effect - Compact */}
                <View style={twrnc`relative mb-4`}>
                  {/* Outer pulse ring */}
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#4361EE',
                        opacity: 0.1,
                        transform: [{ scale: 1.3 }]
                      }
                    ]}
                  />
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#4361EE',
                        opacity: 0.15,
                        transform: [{ scale: 1.15 }]
                      }
                    ]}
                  />

                  {/* Main icon container - Compact */}
                  <View
                    style={[
                      twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                      {
                        backgroundColor: '#4361EE20',
                        borderWidth: 2,
                        borderColor: '#4361EE40'
                      }
                    ]}
                  >
                    <Ionicons name="people" size={36} color="#4361EE" />
                  </View>
                </View>

                {/* Text Content - Compact */}
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2 text-center`}>
                  No Friends Yet
                </CustomText>

                <CustomText style={twrnc`text-gray-400 text-center text-sm mb-5 leading-5 px-2`}>
                  Connect with friends to share activities and compete
                </CustomText>

                {/* Feature Pills - Compact */}
                <View style={twrnc`flex-row flex-wrap justify-center mb-6 -mx-1`}>
                  {[
                    { icon: 'trophy', label: 'Compete', color: '#FFC107' },
                    { icon: 'fitness', label: 'Track', color: '#06D6A0' },
                    { icon: 'flame', label: 'Motivate', color: '#EF476F' }
                  ].map((feature, idx) => (
                    <View
                      key={idx}
                      style={[
                        twrnc`mx-1 mb-2 px-2.5 py-1.5 rounded-full flex-row items-center`,
                        { backgroundColor: `${feature.color}20` }
                      ]}
                    >
                      <Ionicons name={feature.icon} size={12} color={feature.color} style={twrnc`mr-1`} />
                      <CustomText weight="semibold" style={[twrnc`text-[10px]`, { color: feature.color }]}>
                        {feature.label}
                      </CustomText>
                    </View>
                  ))}
                </View>

                {/* CTA Button - Compact */}
                <TouchableOpacity
                  style={[
                    twrnc`py-3 px-6 rounded-xl shadow-lg flex-row items-center`,
                    {
                      backgroundColor: '#4361EE',
                      elevation: 8
                    }
                  ]}
                  onPress={() => setIsAddFriendModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={18} color="#FFFFFF" style={twrnc`mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                    Find Friends
                  </CustomText>
                </TouchableOpacity>

                {/* Bottom accent line */}
                <View style={twrnc`absolute bottom-0 left-0 right-0 h-1 flex-row`}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`flex-1 h-full`,
                        { backgroundColor: i % 2 === 0 ? '#4361EE40' : '#4361EE20' }
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}


        {activeTab === "requests" && (
          <>
            {/* Enhanced Header with Gradient Background - Compact & Uniform */}
            <View style={twrnc`mb-6`}>
              <View
                style={[
                  twrnc`rounded-2xl p-3.5 overflow-hidden`,
                  { backgroundColor: '#1F2937' }
                ]}
              >
                {/* Decorative Background Pattern */}
                <View style={twrnc`absolute top-0 right-0 w-28 h-28 opacity-5`}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          twrnc`w-1/4 h-1/4 border border-[#06D6A0]`,
                          { transform: [{ rotate: '45deg' }] }
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <View style={twrnc`flex-row justify-between items-center z-10`}>
                  <View style={twrnc`flex-1`}>
                    <View style={twrnc`flex-row items-center mb-0.5`}>
                      <View style={twrnc`w-1 h-5 bg-[#06D6A0] rounded-full mr-2.5`} />
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        Requests
                      </CustomText>
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs ml-3.5`}>
                      {friendRequests.length > 0
                        ? `${friendRequests.length} pending ${friendRequests.length === 1 ? 'request' : 'requests'}`
                        : 'No pending requests'
                      }
                    </CustomText>
                  </View>

                  {friendRequests.length > 0 && (
                    <View
                      style={[
                        twrnc`px-3 py-1.5 rounded-xl`,
                        { backgroundColor: '#06D6A020' }
                      ]}
                    >
                      <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-xs`}>
                        {friendRequests.length}
                      </CustomText>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {friendRequests.length > 0 ? (
              <FlatList
                data={friendRequests}
                renderItem={renderRequestItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              /* Enhanced Empty State - Compact & Uniform */
              <View style={twrnc`bg-[#1F2937] rounded-3xl p-6 items-center overflow-hidden relative`}>
                {/* Decorative Circles Background - FIXED */}
                <View style={[
                  twrnc`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#06D6A0' }
                ]} />
                <View style={[
                  twrnc`absolute -bottom-10 -left-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#06D6A0' }
                ]} />

                {/* Icon Container with Pulse Effect - Compact */}
                <View style={twrnc`relative mb-4`}>
                  {/* Outer pulse rings */}
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#06D6A0',
                        opacity: 0.1,
                        transform: [{ scale: 1.3 }]
                      }
                    ]}
                  />
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#06D6A0',
                        opacity: 0.15,
                        transform: [{ scale: 1.15 }]
                      }
                    ]}
                  />

                  {/* Main icon container - Compact */}
                  <View
                    style={[
                      twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                      {
                        backgroundColor: '#06D6A020',
                        borderWidth: 2,
                        borderColor: '#06D6A040'
                      }
                    ]}
                  >
                    <Ionicons name="person-add" size={36} color="#06D6A0" />
                  </View>
                </View>

                {/* Text Content - Compact */}
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2 text-center`}>
                  No Friend Requests
                </CustomText>

                <CustomText style={twrnc`text-gray-400 text-center text-sm mb-5 leading-5 px-2`}>
                  Friend requests will appear here when received
                </CustomText>

                {/* Feature Pills - Compact */}
                <View style={twrnc`flex-row flex-wrap justify-center mb-6 -mx-1`}>
                  {[
                    { icon: 'notifications', label: 'Alerts', color: '#06D6A0' },
                    { icon: 'checkmark-circle', label: 'Accept', color: '#10B981' },
                    { icon: 'close-circle', label: 'Decline', color: '#EF4444' }
                  ].map((feature, idx) => (
                    <View
                      key={idx}
                      style={[
                        twrnc`mx-1 mb-2 px-2.5 py-1.5 rounded-full flex-row items-center`,
                        { backgroundColor: `${feature.color}20` }
                      ]}
                    >
                      <Ionicons name={feature.icon} size={12} color={feature.color} style={twrnc`mr-1`} />
                      <CustomText weight="semibold" style={[twrnc`text-[10px]`, { color: feature.color }]}>
                        {feature.label}
                      </CustomText>
                    </View>
                  ))}
                </View>

                {/* Info Card */}
                <View
                  style={[
                    twrnc`p-3 rounded-xl w-full`,
                    { backgroundColor: '#06D6A010' }
                  ]}
                >
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="information-circle" size={16} color="#06D6A0" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs leading-5 flex-1`}>
                      You'll be notified when someone sends you a friend request
                    </CustomText>
                  </View>
                </View>

                {/* Bottom accent line */}
                <View style={twrnc`absolute bottom-0 left-0 right-0 h-1 flex-row`}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`flex-1 h-full`,
                        { backgroundColor: i % 2 === 0 ? '#06D6A040' : '#06D6A020' }
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}


        {activeTab === "challenges" && (
          <>
            <View style={twrnc`mb-6`}>
              <View
                style={[
                  twrnc`rounded-2xl p-3.5 overflow-hidden`,
                  { backgroundColor: '#1F2937' }
                ]}
              >
                {/* Decorative Background Pattern */}
                <View style={twrnc`absolute top-0 right-0 w-28 h-28 opacity-5`}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          twrnc`w-1/4 h-1/4 border border-[#FFC107]`,
                          { transform: [{ rotate: '45deg' }] }
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <View style={twrnc`flex-row justify-between items-center z-10`}>
                  <View style={twrnc`flex-1`}>
                    <View style={twrnc`flex-row items-center mb-0.5`}>
                      <View style={twrnc`w-1 h-5 bg-[#FFC107] rounded-full mr-2.5`} />
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        Challenges
                      </CustomText>
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs ml-3.5`}>
                      {challenges.length} active {challenges.length === 1 ? 'challenge' : 'challenges'}
                    </CustomText>
                  </View>

                  <TouchableOpacity
                    onPress={() => setIsCreateChallengeModalVisible(true)}
                    style={[
                      twrnc`px-3.5 py-2 rounded-xl flex-row items-center shadow-lg`,
                      { backgroundColor: '#FFC107' }
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={14} color="#121826" style={twrnc`mr-1.5`} />
                    <CustomText weight="bold" style={twrnc`text-[#121826] text-xs`}>
                      Create
                    </CustomText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {challenges.length > 0 ? (
              <FlatList
                data={challenges}
                renderItem={renderChallengeItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              /* Enhanced Empty State - Compact */
              <View style={twrnc`bg-[#1F2937] rounded-3xl p-6 items-center overflow-hidden relative`}>
                {/* Decorative Circles Background - FIXED */}
                <View style={[
                  twrnc`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#FFC107' }
                ]} />
                <View style={[
                  twrnc`absolute -bottom-10 -left-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#FFC107' }
                ]} />

                {/* Icon Container with Pulse Effect - Smaller */}
                <View style={twrnc`relative mb-4`}>
                  {/* Outer pulse ring */}
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#FFC107',
                        opacity: 0.1,
                        transform: [{ scale: 1.3 }]
                      }
                    ]}
                  />
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#FFC107',
                        opacity: 0.15,
                        transform: [{ scale: 1.15 }]
                      }
                    ]}
                  />

                  {/* Main icon container - Compact */}
                  <View
                    style={[
                      twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                      {
                        backgroundColor: '#FFC10720',
                        borderWidth: 2,
                        borderColor: '#FFC10740'
                      }
                    ]}
                  >
                    <Ionicons name="trophy" size={36} color="#FFC107" />
                  </View>
                </View>

                {/* Text Content - Compact */}
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2 text-center`}>
                  No Active Challenges
                </CustomText>

                <CustomText style={twrnc`text-gray-400 text-center text-sm mb-5 leading-5 px-2`}>
                  Create a challenge and invite friends to compete
                </CustomText>

                {/* Feature Pills - Compact */}
                <View style={twrnc`flex-row flex-wrap justify-center mb-6 -mx-1`}>
                  {[
                    { icon: 'people', label: 'Duo', color: '#4361EE' },
                    { icon: 'trophy', label: 'Compete', color: '#FFC107' },
                    { icon: 'flash', label: 'Win XP', color: '#EF476F' }
                  ].map((feature, idx) => (
                    <View
                      key={idx}
                      style={[
                        twrnc`mx-1 mb-2 px-2.5 py-1.5 rounded-full flex-row items-center`,
                        { backgroundColor: `${feature.color}20` }
                      ]}
                    >
                      <Ionicons name={feature.icon} size={12} color={feature.color} style={twrnc`mr-1`} />
                      <CustomText weight="semibold" style={[twrnc`text-[10px]`, { color: feature.color }]}>
                        {feature.label}
                      </CustomText>
                    </View>
                  ))}
                </View>

                {/* CTA Button - Compact */}
                <TouchableOpacity
                  style={[
                    twrnc`py-3 px-6 rounded-xl shadow-lg flex-row items-center`,
                    {
                      backgroundColor: '#FFC107',
                      elevation: 8
                    }
                  ]}
                  onPress={() => setIsCreateChallengeModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={18} color="#121826" style={twrnc`mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-[#121826] text-sm`}>
                    Create Challenge
                  </CustomText>
                </TouchableOpacity>

                {/* Bottom accent line */}
                <View style={twrnc`absolute bottom-0 left-0 right-0 h-1 flex-row`}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`flex-1 h-full`,
                        { backgroundColor: i % 2 === 0 ? '#FFC10740' : '#FFC10720' }
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}


        {activeTab === "leaderboard" && (
          <>
            {/* Top 3 Podium Section */}
            {leaderboard.length >= 3 && (
              <View style={twrnc`mb-6`}>
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-4`}>
                  Top Champions
                </CustomText>
                <View style={twrnc`flex-row items-end justify-center mb-6`}>
                  {/* 2nd Place - Shows Available XP */}
                  <View style={twrnc`items-center flex-1 mb-8`}>
                    <View style={twrnc`relative`}>
                      <Image
                        source={{ uri: leaderboard[1]?.avatar || DEFAULT_AVATAR }}
                        style={twrnc`w-16 h-16 rounded-2xl border-3 border-[#C0C0C0]`}
                      />
                      <View style={twrnc`absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#C0C0C0] items-center justify-center border-2 border-[#1F2937]`}>
                        <CustomText weight="bold" style={twrnc`text-[#1F2937] text-xs`}>2</CustomText>
                      </View>
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mt-2`} numberOfLines={1}>
                      {leaderboard[1]?.name}
                    </CustomText>
                    <View style={twrnc`bg-[#C0C0C020] px-3 py-1.5 rounded-lg mt-1`}>
                      <CustomText weight="bold" style={twrnc`text-[#C0C0C0] text-xs`}>
                        {leaderboard[1]?.xp?.toLocaleString()} XP
                      </CustomText>
                    </View>
                  </View>

                  {/* 1st Place - Shows Available XP */}
                  <View style={twrnc`items-center flex-1`}>
                    <View style={twrnc`absolute -top-3`}>
                      <Ionicons name="trophy" size={24} color="#FFD700" />
                    </View>
                    <View style={twrnc`relative mt-6`}>
                      <Image
                        source={{ uri: leaderboard[0]?.avatar || DEFAULT_AVATAR }}
                        style={twrnc`w-20 h-20 rounded-2xl border-4 border-[#FFD700]`}
                      />
                      <View style={twrnc`absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#FFD700] items-center justify-center border-2 border-[#1F2937]`}>
                        <CustomText weight="bold" style={twrnc`text-[#1F2937] text-sm`}>1</CustomText>
                      </View>
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-base mt-2`} numberOfLines={1}>
                      {leaderboard[0]?.name}
                    </CustomText>
                    <View style={twrnc`bg-[#FFD70020] px-3 py-1.5 rounded-lg mt-1`}>
                      <CustomText weight="bold" style={twrnc`text-[#FFD700] text-sm`}>
                        {leaderboard[0]?.xp?.toLocaleString()} XP
                      </CustomText>
                    </View>
                  </View>

                  {/* 3rd Place - Shows Available XP */}
                  <View style={twrnc`items-center flex-1 mb-8`}>
                    <View style={twrnc`relative`}>
                      <Image
                        source={{ uri: leaderboard[2]?.avatar || DEFAULT_AVATAR }}
                        style={twrnc`w-16 h-16 rounded-2xl border-3 border-[#CD7F32]`}
                      />
                      <View style={twrnc`absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#CD7F32] items-center justify-center border-2 border-[#1F2937]`}>
                        <CustomText weight="bold" style={twrnc`text-[#1F2937] text-xs`}>3</CustomText>
                      </View>
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mt-2`} numberOfLines={1}>
                      {leaderboard[2]?.name}
                    </CustomText>
                    <View style={twrnc`bg-[#CD7F3220] px-3 py-1.5 rounded-lg mt-1`}>
                      <CustomText weight="bold" style={twrnc`text-[#CD7F32] text-xs`}>
                        {leaderboard[2]?.xp?.toLocaleString()} XP
                      </CustomText>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Full Leaderboard - Shows Available XP */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                Full Rankings
              </CustomText>
              {leaderboard.length > 0 ? (
                leaderboard.map((user, index) => (
                  <View
                    key={user.id}
                    style={[
                      twrnc`flex-row items-center justify-between rounded-xl p-3 mb-2`,
                      { backgroundColor: user.isCurrentUser ? '#4361EE20' : '#111827' }
                    ]}
                  >
                    <View style={twrnc`flex-row items-center flex-1`}>
                      {/* Rank Badge */}
                      <View
                        style={[
                          twrnc`w-6 h-6 rounded-full items-center justify-center mr-3`,
                          {
                            backgroundColor:
                              index === 0 ? "#FBBF24" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : "#374151",
                          },
                        ]}
                      >
                        <CustomText
                          weight="bold"
                          style={[
                            twrnc`text-xs`,
                            { color: index < 3 ? "#78350F" : "#9BA3AF" }
                          ]}
                        >
                          {index + 1}
                        </CustomText>
                      </View>

                      {/* Avatar */}
                      <Image
                        source={{ uri: user.avatar || DEFAULT_AVATAR }}
                        style={twrnc`w-9 h-9 rounded-full mr-2.5`}
                      />

                      {/* User Info */}
                      <View style={twrnc`flex-1`}>
                        <View style={twrnc`flex-row items-center`}>
                          <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                            {user.isCurrentUser ? "You" : user.name}
                          </CustomText>
                          {user.isCurrentUser && (
                            <View style={twrnc`ml-2 bg-[#4361EE] rounded-full px-2 py-0.5`}>
                              <CustomText weight="bold" style={twrnc`text-white text-9px`}>
                                YOU
                              </CustomText>
                            </View>
                          )}
                        </View>
                        <CustomText style={twrnc`text-gray-400 text-xs`}>
                          Lvl {user.level || 1} • {user.distance?.toFixed(1) || 0} km
                        </CustomText>
                      </View>
                    </View>

                    {/* Available XP Display */}
                    <View style={twrnc`items-end`}>
                      <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-sm`}>
                        {user.xp?.toLocaleString() || 0}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-9px uppercase`}>
                        Available
                      </CustomText>
                    </View>

                    {/* Winner Badge for #1 */}
                    {index === 0 && (
                      <View style={twrnc`absolute -top-1 -right-1 bg-[#FBBF24] px-2.5 py-1 rounded-full`}>
                        <CustomText weight="bold" style={twrnc`text-[#78350F] text-9px uppercase`}>
                          Leader
                        </CustomText>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <View style={twrnc`bg-[#111827] rounded-xl p-6 items-center`}>
                  <Ionicons name="trophy-outline" size={48} color="#374151" />
                  <CustomText weight="semibold" style={twrnc`text-gray-400 text-sm text-center mt-3`}>
                    No leaderboard data yet
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-xs text-center mt-1`}>
                    Complete activities to appear here
                  </CustomText>
                </View>
              )}
            </View>

            {/* Your Stats Card - Shows Total XP */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                Your Performance
              </CustomText>
              <View style={twrnc`bg-[#1F2937] rounded-xl p-4 border-l-4 border-[#4361EE]`}>
                {/* Stats Grid */}
                <View style={twrnc`flex-row flex-wrap -mx-1 mb-4`}>
                  {/* Rank */}
                  <View style={twrnc`w-1/3 px-1 mb-2`}>
                    <View style={twrnc`rounded-xl p-3 bg-[#FF6B3520]`}>
                      <CustomText style={twrnc`text-[#FF6B35] text-9px uppercase mb-1`}>
                        Rank
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#FF6B35] text-sm`}>
                        #{leaderboard.findIndex((user) => user.isCurrentUser) + 1 || "-"}
                      </CustomText>
                    </View>
                  </View>

                  {/* Friends */}
                  <View style={twrnc`w-1/3 px-1 mb-2`}>
                    <View style={twrnc`rounded-xl p-3 bg-[#34D399] bg-opacity-15`}>
                      <CustomText style={twrnc`text-[#34D399] text-9px uppercase mb-1`}>
                        Friends
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#34D399] text-sm`}>
                        {userProfile?.friends?.length || 0}
                      </CustomText>
                    </View>
                  </View>

                  {/* Challenges */}
                  <View style={twrnc`w-1/3 px-1 mb-2`}>
                    <View style={twrnc`rounded-xl p-3 bg-[#FFC10720]`}>
                      <CustomText style={twrnc`text-[#FFC107] text-9px uppercase mb-1`}>
                        Active
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#FFC107] text-sm`}>
                        {challenges.length}
                      </CustomText>
                    </View>
                  </View>

                  {/* Distance */}
                  <View style={twrnc`w-1/2 px-1`}>
                    <View style={twrnc`rounded-xl p-3 bg-[#06D6A020]`}>
                      <CustomText style={twrnc`text-[#06D6A0] text-9px uppercase mb-1`}>
                        Distance
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-sm`}>
                        {currentUserLeaderboard?.distance?.toFixed(1) || "0"} km
                      </CustomText>
                    </View>
                  </View>

                  {/* Total XP - Shows totalXP from user profile */}
                  <View style={twrnc`w-1/2 px-1`}>
                    <View style={twrnc`rounded-xl p-3 bg-[#9B5DE520]`}>
                      <CustomText style={twrnc`text-[#9B5DE5] text-9px uppercase mb-1`}>
                        Total XP
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-sm`}>
                        {currentUserLeaderboard?.totalXP?.toLocaleString() || "0"}
                      </CustomText>
                    </View>
                  </View>
                </View>

                {/* View Profile Button */}
                <TouchableOpacity
                  style={twrnc`bg-[#4361EE] rounded-xl py-3 items-center`}
                  onPress={() => {
                    navigateToProfile();
                  }}
                  activeOpacity={0.7}
                >
                  <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                    View Full Profile
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}



        {activeTab === "history" && (
          <>
            {/* Enhanced Header with Gradient Background - Compact */}
            <View style={twrnc`mb-6`}>
              <View
                style={[
                  twrnc`rounded-2xl p-3.5 overflow-hidden`,
                  { backgroundColor: '#1F2937' }
                ]}
              >
                {/* Decorative Background Pattern */}
                <View style={twrnc`absolute top-0 right-0 w-28 h-28 opacity-5`}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          twrnc`w-1/4 h-1/4 border border-[#9B5DE5]`,
                          { transform: [{ rotate: '45deg' }] }
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <View style={twrnc`flex-row justify-between items-center z-10`}>
                  <View style={twrnc`flex-1`}>
                    <View style={twrnc`flex-row items-center mb-0.5`}>
                      <View style={twrnc`w-1 h-5 bg-[#9B5DE5] rounded-full mr-2.5`} />
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        History
                      </CustomText>
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs ml-3.5`}>
                      {pastChallenges.length > 0
                        ? `${pastChallenges.length} completed ${pastChallenges.length === 1 ? 'challenge' : 'challenges'}`
                        : 'No past challenges yet'
                      }
                    </CustomText>
                  </View>

                  {pastChallenges.length > 0 && (
                    <View
                      style={[
                        twrnc`px-3 py-1.5 rounded-xl`,
                        { backgroundColor: '#9B5DE520' }
                      ]}
                    >
                      <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-xs`}>
                        {pastChallenges.length}
                      </CustomText>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {pastChallenges.length > 0 ? (
              <FlatList
                data={pastChallenges}
                renderItem={renderPastChallengeItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            ) : (
              /* Enhanced Empty State - Compact */
              <View style={twrnc`bg-[#1F2937] rounded-3xl p-6 items-center overflow-hidden relative`}>
                {/* Decorative Circles Background - FIXED */}
                <View style={[
                  twrnc`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#9B5DE5' }
                ]} />
                <View style={[
                  twrnc`absolute -bottom-10 -left-10 w-32 h-32 rounded-full opacity-5`,
                  { backgroundColor: '#9B5DE5' }
                ]} />

                {/* Icon Container with Pulse Effect - Compact */}
                <View style={twrnc`relative mb-4`}>
                  {/* Outer pulse rings */}
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#9B5DE5',
                        opacity: 0.1,
                        transform: [{ scale: 1.3 }]
                      }
                    ]}
                  />
                  <View
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      {
                        backgroundColor: '#9B5DE5',
                        opacity: 0.15,
                        transform: [{ scale: 1.15 }]
                      }
                    ]}
                  />

                  {/* Main icon container - Compact */}
                  <View
                    style={[
                      twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                      {
                        backgroundColor: '#9B5DE520',
                        borderWidth: 2,
                        borderColor: '#9B5DE540'
                      }
                    ]}
                  >
                    <Ionicons name="time" size={36} color="#9B5DE5" />
                  </View>
                </View>

                {/* Text Content - Compact */}
                <CustomText weight="bold" style={twrnc`text-white text-xl mb-2 text-center`}>
                  No Challenge History
                </CustomText>

                <CustomText style={twrnc`text-gray-400 text-center text-sm mb-5 leading-5 px-2`}>
                  Your completed and expired challenges will appear here
                </CustomText>

                {/* Feature Pills - Compact */}
                <View style={twrnc`flex-row flex-wrap justify-center mb-6 -mx-1`}>
                  {[
                    { icon: 'trophy', label: 'Wins', color: '#FFC107' },
                    { icon: 'bar-chart', label: 'Stats', color: '#06D6A0' },
                    { icon: 'flame', label: 'Streaks', color: '#EF476F' }
                  ].map((feature, idx) => (
                    <View
                      key={idx}
                      style={[
                        twrnc`mx-1 mb-2 px-2.5 py-1.5 rounded-full flex-row items-center`,
                        { backgroundColor: `${feature.color}20` }
                      ]}
                    >
                      <Ionicons name={feature.icon} size={12} color={feature.color} style={twrnc`mr-1`} />
                      <CustomText weight="semibold" style={[twrnc`text-[10px]`, { color: feature.color }]}>
                        {feature.label}
                      </CustomText>
                    </View>
                  ))}
                </View>

                {/* Info Card */}
                <View
                  style={[
                    twrnc`p-3 rounded-xl w-full`,
                    { backgroundColor: '#9B5DE510' }
                  ]}
                >
                  <View style={twrnc`flex-row items-start`}>
                    <Ionicons name="information-circle" size={16} color="#9B5DE5" style={twrnc`mr-2 mt-0.5`} />
                    <CustomText style={twrnc`text-gray-400 text-xs leading-5 flex-1`}>
                      Complete challenges to build your history and track your progress over time
                    </CustomText>
                  </View>
                </View>

                {/* Bottom accent line */}
                <View style={twrnc`absolute bottom-0 left-0 right-0 h-1 flex-row`}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`flex-1 h-full`,
                        { backgroundColor: i % 2 === 0 ? '#9B5DE540' : '#9B5DE520' }
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}


      </ScrollView>

      <AddFriendModal
        isVisible={isAddFriendModalVisible}
        onClose={() => setIsAddFriendModalVisible(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        searchLoading={searchLoading}
        friends={friends}
        sendingFriendRequests={sendingFriendRequests}
        onSelectFriend={setSelectedFriend}
        onShowProfile={() => setIsFriendProfileVisible(true)}
        handleSendFriendRequest={handleSendFriendRequest}
        renderSearchResultItem={renderSearchResultItem}
      />

      <CreateChallengeModal
        isVisible={isCreateChallengeModalVisible}
        onClose={() => setIsCreateChallengeModalVisible(false)}
        newChallenge={newChallenge}
        setNewChallenge={setNewChallenge}
        friends={friends}
        activities={activities}
        CHALLENGE_GROUP_TYPES={CHALLENGE_GROUP_TYPES}
        handleCreateChallenge={handleCreateChallenge}
        creatingChallenge={creatingChallenge}
      />

      <FriendProfileModal
        isVisible={isFriendProfileVisible}
        onClose={() => setIsFriendProfileVisible(false)}
        selectedFriend={selectedFriend}
        formatLastActive={formatLastActive}
        formatTime={formatTime}
        getActivityDisplayInfo={getActivityDisplayInfo}
      />

      <EditChallengeModal
        isVisible={isEditChallengeModalVisible}
        onClose={() => {
          setIsEditChallengeModalVisible(false);
          setSelectedChallenge(null);
          setCreatingChallenge(false);
        }}
        selectedChallenge={selectedChallenge}
        newChallenge={newChallenge}
        setNewChallenge={setNewChallenge}
        CHALLENGE_GROUP_TYPES={CHALLENGE_GROUP_TYPES}
        activities={activities}
        creatingChallenge={creatingChallenge}
        onSaveChanges={handleSaveChallenge}
      />


      <DuoVsModal
        visible={showVsModal}
        player1={vsModalData.player1}
        player2={vsModalData.player2}
        stakeXP={vsModalData.stakeXP}
        challengeId={vsModalData.challengeId}
        fullChallenge={vsModalData.fullChallenge}
        onClose={() => setShowVsModal(false)}
        navigateToActivityWithChallenge={navigateToActivityWithChallenge}
      />

      <SquadVsModal
        visible={showSquadModal}
        challengeId={squadModalData.challengeId}
        participants={squadModalData.participants}
        stakeXP={squadModalData.stakeXP}
        fullChallenge={squadModalData.fullChallenge}
        onClose={() => setShowSquadModal(false)}
        navigateToActivityWithChallenge={navigateToActivityWithChallenge}
      />

      <ChallengeDetailsModal
        isVisible={isChallengeDetailsVisible}
        onClose={() => setIsChallengeDetailsVisible(false)}
        selectedChallenge={selectedChallenge}
        setSelectedChallenge={setSelectedChallenge}
        auth={auth}
        activities={activities}
        joiningChallenges={joiningChallenges}
        handleJoinChallenge={handleJoinChallenge}
        navigateToActivityWithChallenge={navigateToActivityWithChallenge}
        handleEditChallenge={handleEditChallenge}
        handleDeleteChallenge={handleDeleteChallenge}
        creatingChallenge={creatingChallenge}
        handleStartChallenge={handleStartChallenge}
        handleAcceptChallenge={handleAcceptChallenge}
        startingChallenge={startingChallenge}
        onShowDuoVs={({ challengeId, player1, player2, stakeXP, fullChallenge }) => {
          setVsModalData({ visible: true, challengeId, player1, player2, stakeXP, fullChallenge })
          setShowVsModal(true)
        }}

      />

      <WinnerModal
        visible={isWinnerModalVisible}
        onClose={() => setIsWinnerModalVisible(false)}
        result={finalizationData}
        participantsData={participantsData}
        currentUserId={auth.currentUser?.uid}
      />

    </View>
  )
}

export default CommunityScreen
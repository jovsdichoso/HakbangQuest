import {
  getDocs,
  collection,
  query,
  where,
  doc,
  updateDoc,
  arrayUnion,
  getDoc,
  addDoc,
  serverTimestamp,
  limit,
  orderBy,
  setDoc,
  onSnapshot,
  Timestamp,
  documentId,
  writeBatch,
  deleteDoc,
  runTransaction,
  increment,
} from "firebase/firestore"
import { db, auth } from "../firebaseConfig"
import AsyncStorage from "@react-native-async-storage/async-storage"
import NotificationService from "../services/NotificationService"

// Default avatar image to use when user has no avatar
const DEFAULT_AVATAR = "https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg"

// Cache TTL in milliseconds (30 minutes)
const CACHE_TTL = 30 * 60 * 1000

// Activity types with their configurations
export const ACTIVITY_TYPES = [
  {
    id: "walking",
    name: "Walking",
    icon: "walk-outline",
    color: "#4361EE",
    unit: "km",
  },
  {
    id: "running",
    name: "Running",
    icon: "fitness-outline",
    color: "#EF476F",
    unit: "km",
  },
  {
    id: "cycling",
    name: "Cycling",
    icon: "bicycle-outline",
    color: "#06D6A0",
    unit: "km",
  },
  {
    id: "jogging", // Added jogging for consistency with ActivityScreen
    name: "Jogging",
    icon: "walk-outline", // You might want a specific jogging icon
    color: "#FFC107",
    unit: "km",
  },
  {
    id: "pushup",
    name: "Push-ups",
    icon: "fitness-outline",
    color: "#9B5DE5",
    unit: "reps",
  },
]

// Difficulty levels
export const DIFFICULTY_LEVELS = [
  { id: "easy", name: "Easy", multiplier: 0.7, color: "#06D6A0", icon: "leaf-outline" },
  { id: "medium", name: "Medium", multiplier: 1.0, color: "#FFC107", icon: "flame-outline" },
  { id: "hard", name: "Hard", multiplier: 1.5, color: "#EF476F", icon: "flash-outline" },
  { id: "extreme", name: "Extreme", multiplier: 2.0, color: "#9B5DE5", icon: "skull-outline" },
]

// FIXED: Challenge group types with solo, duo, and lobby
export const CHALLENGE_GROUP_TYPES = [
  {
    id: "solo",
    name: "Solo Challenge",
    maxParticipants: 1,
    description: "A challenge for yourself."
  },
  {
    id: "duo",
    name: "Duo Challenge",
    maxParticipants: 2,
    description: "A challenge for you and one friend."
  },
  {
    id: "lobby",
    name: "Lobby Challenge",
    maxParticipants: 5,
    minParticipants: 3, // Add this
    description: "A challenge for 3-5 players (you and 2-4 friends).",
  },
];

// Helper function to serialize user objects for Firestore
export const serializeUserForFirestore = (user) => {
  if (!user) return null
  return {
    id: user.id,
    username: user.username || "",
    displayName: user.displayName || "",
    avatar: user.avatar || DEFAULT_AVATAR,
    email: user.email || "",
  }
}

// Cache helper functions
export const getCachedData = async (key) => {
  try {
    const cachedData = await AsyncStorage.getItem(key)
    if (cachedData) {
      const { data, timestamp } = JSON.parse(cachedData)
      if (Date.now() - timestamp < CACHE_TTL) {
        return data
      }
    }
    return null
  } catch (error) {
    console.warn("Error reading from cache:", error)
    return null
  }
}

export const setCachedData = async (key, data) => {
  try {
    const cacheItem = {
      data,
      timestamp: Date.now(),
    }
    await AsyncStorage.setItem(key, JSON.stringify(cacheItem))
  } catch (error) {
    console.warn("Error writing to cache:", error)
  }
}

// User Profile Management
export const loadUserProfile = async (callbacks) => {
  const { setUserProfile, setFriends, setError, setLoading, setInitialLoadComplete } = callbacks
  const user = auth.currentUser
  if (!user) return

  setLoading(true)
  setError(null)

  try {
    const cachedProfile = await getCachedData(`userProfile_${user.uid}`)
    if (cachedProfile) {
      setUserProfile(cachedProfile)
      loadInitialFriends(cachedProfile.friends || [], callbacks)
    }

    const userDocRef = doc(db, "users", user.uid)
    const userListener = onSnapshot(
      userDocRef,
      async (docSnapshot) => {
        try {
          if (docSnapshot.exists()) {
            const userData = docSnapshot.data()
            const profileData = { id: user.uid, ...userData }
            setUserProfile(profileData)
            await setCachedData(`userProfile_${user.uid}`, profileData)
            loadInitialFriends(userData.friends || [], callbacks)
          } else {
            const newUserData = {
              username: user.displayName || user.email.split("@")[0],
              email: user.email,
              avatar: DEFAULT_AVATAR,
              friends: [],
              createdAt: serverTimestamp(),
            }
            await setDoc(userDocRef, newUserData)
            const profileData = { id: user.uid, ...newUserData }
            setUserProfile(profileData)
            setFriends([])
            await setCachedData(`userProfile_${user.uid}`, profileData)
          }
        } catch (err) {
          console.error("Error in user profile listener:", err)
          setError("Failed to load user profile.")
        } finally {
          setLoading(false)
          setInitialLoadComplete(true)
        }
      },
      (error) => {
        console.error("Error in user profile snapshot:", error)
        setError("Failed to load user profile.")
        setLoading(false)
        setInitialLoadComplete(true)
      },
    )

    return userListener
  } catch (err) {
    console.error("Error loading initial data:", err)
    setError("Failed to load data. Please check your connection.")
    setLoading(false)
    setInitialLoadComplete(true)
    return null
  }
}

// Friends Management
export const loadInitialFriends = async (friendIds, callbacks) => {
  const { setFriends, setHasMoreFriends, setFriendsPage, setLoadingMoreFriends } = callbacks

  if (!friendIds || friendIds.length === 0) {
    setFriends([])
    setHasMoreFriends(false)
    setFriendsPage(1)
    setLoadingMoreFriends(false)
    return
  }

  try {
    const cachedFriends = await getCachedData("friends")
    if (cachedFriends) {
      setFriends(cachedFriends)
      loadAllFriends(friendIds, callbacks, true)
      return
    }

    await loadAllFriends(friendIds, callbacks, false)
  } catch (err) {
    console.error("Error loading initial friends:", err)
    throw err
  }
}

export const loadAllFriends = async (allFriendIds, callbacks, isBackgroundRefresh = false) => {
  const { setFriends, setHasMoreFriends, setFriendsPage, setLoadingMoreFriends } = callbacks

  if (!allFriendIds || allFriendIds.length === 0) {
    setFriends([])
    setHasMoreFriends(false)
    setFriendsPage(1)
    setLoadingMoreFriends(false)
    return
  }

  if (!isBackgroundRefresh) {
    setLoadingMoreFriends(true)
  }

  try {
    const friendsData = []
    // Batch friend IDs into chunks of 10 due to Firestore's 'in' query limit
    const chunks = []
    for (let i = 0; i < allFriendIds.length; i += 10) {
      chunks.push(allFriendIds.slice(i, i + 10))
    }

    // Fetch all friends in batches
    for (const chunk of chunks) {
      const friendsQuery = query(collection(db, "users"), where(documentId(), "in", chunk))
      const friendsSnapshot = await getDocs(friendsQuery)

      for (const friendDoc of friendsSnapshot.docs) {
        const friendData = {
          id: friendDoc.id,
          ...friendDoc.data(),
          lastActivity: null,
          streak: 0,
          totalDistance: 0,
          totalActivities: 0,
          isOnline: friendDoc.data().isOnline || false,
        }
        friendsData.push(friendData)
        // Load friend activities in the background
        loadFriendActivities(friendDoc.id, friendData, callbacks)
      }
    }

    setFriends(friendsData)

    await setCachedData("friends", friendsData)

    setFriendsPage(1)
    setHasMoreFriends(false)
  } catch (err) {
    console.error("Error loading all friends:", err)
    throw err
  } finally {
    setLoadingMoreFriends(false)
  }
}

export const loadFriendActivities = async (friendId, friendData, callbacks) => {
  const { setFriends } = callbacks

  try {
    const cacheKey = `friendActivities_${friendId}`
    const cachedActivities = await getCachedData(cacheKey)
    if (cachedActivities) {
      updateFriendWithActivity(friendId, cachedActivities[0], cachedActivities.length, setFriends)
    }

    const activitiesRef = collection(db, "activities")
    const activitiesQuery = query(
      activitiesRef,
      where("userId", "==", friendId),
      orderBy("createdAt", "desc"),
      limit(5),
    )
    const activitiesSnapshot = await getDocs(activitiesQuery)

    let activities = []
    if (!activitiesSnapshot.empty) {
      activities = activitiesSnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          distance: typeof data.distance === "number" && !isNaN(data.distance) ? data.distance : 0,
        }
      })
      await setCachedData(cacheKey, activities)
      updateFriendWithActivity(friendId, activities[0], activities.length, setFriends)
    } else {
      updateFriendWithActivity(friendId, null, 0, setFriends)
    }
  } catch (err) {
    console.warn(`Error loading activities for friend ${friendId}:`, err)
  }
}

const updateFriendWithActivity = (friendId, activity, activityCount, setFriends) => {
  setFriends((prevFriends) => {
    return prevFriends.map((f) => {
      if (f.id === friendId) {
        return {
          ...f,
          lastActivity: activity || null,
          streak: activity ? 1 : 0,
          // Treat activity.distance as meters and convert to km for display
          totalDistance: activity && typeof activity.distance === "number" ? activity.distance / 1000 : 0,
          totalActivities: activityCount || 0,
        }
      }
      return f
    })
  })
}

// Friend Requests Management
export const loadFriendRequests = async (userId, callbacks) => {
  const { setFriendRequests, setError } = callbacks

  try {
    const cachedRequests = await getCachedData(`friendRequests_${userId}`)
    if (cachedRequests) {
      setFriendRequests(cachedRequests)
    }

    const requestsRef = collection(db, "friendRequests")
    const requestsQuery = query(requestsRef, where("to", "==", userId), where("status", "==", "pending"))

    const requestsListener = onSnapshot(
      requestsQuery,
      async (querySnapshot) => {
        try {
          const requestsData = []
          const requestPromises = []
          const userCache = {}

          for (const requestDoc of querySnapshot.docs) {
            const requestData = requestDoc.data()
            const promise = (async () => {
              try {
                if (!userCache[requestData.from]) {
                  const fromUserDoc = await getDoc(doc(db, "users", requestData.from))
                  if (fromUserDoc.exists()) {
                    userCache[requestData.from] = fromUserDoc.data()
                  }
                }

                if (userCache[requestData.from]) {
                  const fromUserData = userCache[requestData.from]
                  const mutualFriends = 0
                  requestsData.push({
                    id: requestDoc.id,
                    ...requestData,
                    fromUser: { id: requestData.from, ...fromUserData },
                    mutualFriends,
                  })
                }
              } catch (err) {
                console.warn(`Error processing friend request ${requestDoc.id}:`, err)
              }
            })()
            requestPromises.push(promise)
          }

          await Promise.all(requestPromises)
          setFriendRequests(requestsData)
          await setCachedData(`friendRequests_${userId}`, requestsData)
        } catch (err) {
          console.error("Error processing friend requests:", err)
          setError("Failed to load friend requests.")
        }
      },
      (error) => {
        console.error("Error in friend requests listener:", error)
        setError("Failed to load friend requests.")
      },
    )

    return requestsListener
  } catch (err) {
    console.error("Error setting up friend requests listener:", err)
    return null
  }
}

export const sendFriendRequest = async (userId) => {
  try {
    const user = auth.currentUser

    // Check if request already exists
    const requestsRef = collection(db, "friendRequests")
    const existingRequestQuery = query(
      requestsRef,
      where("from", "==", user.uid),
      where("to", "==", userId),
      where("status", "==", "pending"),
    )
    const existingRequestSnapshot = await getDocs(existingRequestQuery)

    if (!existingRequestSnapshot.empty) {
      throw new Error("You've already sent a friend request to this user.")
    }

    // Add friend request to database
    const requestDoc = await addDoc(requestsRef, {
      from: user.uid,
      to: userId,
      status: "pending",
      createdAt: serverTimestamp(),
    })

    // Get current user data for notification
    const currentUserDoc = await getDoc(doc(db, "users", user.uid))
    const currentUserData = currentUserDoc.data()

    // Send notification using the real NotificationService
    try {
      const notificationId = await NotificationService.sendFriendRequestNotification(
        userId,
        {
          id: user.uid,
          username: currentUserData.username || currentUserData.displayName,
          displayName: currentUserData.displayName || currentUserData.username,
          avatar: currentUserData.avatar || DEFAULT_AVATAR,
        },
        requestDoc.id,
      )

      if (notificationId) {
        console.log(`✅ Friend request notification sent: ${notificationId}`)
      } else {
        console.warn("⚠️ Failed to send friend request notification")
      }
    } catch (notificationError) {
      console.error("❌ Error sending friend request notification:", notificationError)
      // Don't fail the entire operation if notification fails
    }

    return { success: true, message: "Friend request sent successfully!" }
  } catch (err) {
    console.error("Error sending friend request:", err)
    throw new Error(err.message || "Failed to send friend request. Please try again.")
  }
}

export const acceptFriendRequest = async (requestId, fromUserId, callbacks) => {
  const { setFriendRequests, setUserProfile, setFriends } = callbacks

  try {
    const user = auth.currentUser
    if (!user) {
      throw new Error("User not authenticated")
    }

    // Use transaction for atomic friend acceptance
    const result = await runTransaction(db, async (transaction) => {
      // Read all required documents first
      const requestRef = doc(db, "friendRequests", requestId)
      const currentUserRef = doc(db, "users", user.uid)
      const fromUserRef = doc(db, "users", fromUserId)

      const [requestDoc, currentUserDoc, fromUserDoc] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(currentUserRef),
        transaction.get(fromUserRef),
      ])

      // Validate all documents exist
      if (!requestDoc.exists()) {
        throw new Error("Friend request not found. It may have been deleted or already processed.")
      }
      if (!currentUserDoc.exists()) {
        throw new Error("Your user profile could not be found. Please try refreshing the app.")
      }
      if (!fromUserDoc.exists()) {
        throw new Error("The other user's profile could not be found. They may have deleted their account.")
      }

      // Check if request is already processed
      const requestData = requestDoc.data()
      if (requestData.status === "accepted") {
        throw new Error("Friend request has already been accepted.")
      }
      if (requestData.status === "declined") {
        throw new Error("Friend request has already been declined.")
      }

      // Update request status
      transaction.update(requestRef, {
        status: "accepted",
        updatedAt: serverTimestamp(),
      })

      // Update both users' friends arrays atomically using arrayUnion
      const currentUserData = currentUserDoc.data()
      const fromUserData = fromUserDoc.data()

      // Only add if not already friends (arrayUnion handles duplicates, but check for safety)
      const currentUserFriends = currentUserData.friends || []
      const fromUserFriends = fromUserData.friends || []

      if (!currentUserFriends.includes(fromUserId)) {
        transaction.update(currentUserRef, {
          friends: arrayUnion(fromUserId),
        })
      }

      if (!fromUserFriends.includes(user.uid)) {
        transaction.update(fromUserRef, {
          friends: arrayUnion(user.uid),
        })
      }

      return {
        fromUserData: fromUserData,
        success: true,
      }
    })

    // Only after successful transaction, create chat room and update UI
    try {
      const chatRoomId = [user.uid, fromUserId].sort().join("_")
      const chatRoomRef = doc(db, "chatRooms", chatRoomId)
      const chatRoomDoc = await getDoc(chatRoomRef)

      if (!chatRoomDoc.exists()) {
        await setDoc(chatRoomRef, {
          participants: [user.uid, fromUserId],
          createdAt: serverTimestamp(),
          lastMessage: null,
          lastMessageTime: null,
        })
      }
    } catch (err) {
      console.warn("Could not create chat room:", err)
      // Don't fail the entire operation for chat room creation
    }

    // Clear AsyncStorage caches to force refresh from server
    try {
      await AsyncStorage.removeItem(`userProfile_${user.uid}`)
      await AsyncStorage.removeItem(`friends_${user.uid}`)
    } catch (cacheError) {
      console.warn("Could not clear cache:", cacheError)
    }

    // Update UI state only after successful transaction
    setFriendRequests((prev) => prev.filter((req) => req.id !== requestId))

    setUserProfile((prev) => ({
      ...prev,
      friends: [...(prev?.friends || []), fromUserId],
    }))

    const friendData = {
      id: fromUserId,
      ...result.fromUserData,
      lastActivity: null,
      streak: 0,
      totalDistance: 0,
      totalActivities: 0,
      isOnline: result.fromUserData.isOnline || false,
    }
    setFriends((prev) => [friendData, ...prev])
    loadFriendActivities(fromUserId, friendData, { setFriends })

    return { success: true, message: "Friend request accepted!" }
  } catch (err) {
    console.error("Error accepting friend request:", err)
    let errorMessage = "Failed to accept friend request. Please try again."

    if (err.code === "permission-denied") {
      errorMessage = "You don't have permission to accept this friend request. Please check your account permissions."
    } else if (err.code === "not-found") {
      errorMessage = "The friend request or user profile could not be found. It may have been deleted."
    } else if (err.message) {
      errorMessage = err.message
    }

    throw new Error(errorMessage)
  }
}

export const rejectFriendRequest = async (requestId, callbacks) => {
  const { setFriendRequests } = callbacks

  try {
    const requestRef = doc(db, "friendRequests", requestId)
    await updateDoc(requestRef, {
      status: "rejected",
      updatedAt: serverTimestamp(),
    })

    setFriendRequests((prev) => prev.filter((req) => req.id !== requestId))
    return { success: true, message: "Friend request rejected." }
  } catch (err) {
    console.error("Error rejecting friend request:", err)
    throw new Error("Failed to reject friend request. Please try again.")
  }
}

// User Search
export const searchUsers = async (searchTerm) => {
  if (!searchTerm.trim()) {
    return []
  }

  try {
    const user = auth.currentUser
    const userDoc = await getDoc(doc(db, "users", user.uid))
    const userFriends = userDoc.data()?.friends || []

    const cacheKey = `search_${searchTerm.toLowerCase()}`
    const cachedResults = await getCachedData(cacheKey)
    if (cachedResults) {
      return cachedResults.map((result) => ({
        ...result,
        isFriend: userFriends.includes(result.id),
      }))
    }

    const usersRef = collection(db, "users")
    const usersSnapshot = await getDocs(usersRef)

    const results = []
    const lowerQuery = searchTerm.toLowerCase()

    for (const userDoc of usersSnapshot.docs) {
      if (userDoc.id === user.uid) continue

      const userData = userDoc.data()
      const displayName = userData.displayName || ""
      const username = userData.username || ""

      if (displayName.toLowerCase().includes(lowerQuery) || username.toLowerCase().includes(lowerQuery)) {
        const isFriend = userFriends.includes(userDoc.id)
        let requestSent = false

        if (!isFriend) {
          try {
            const requestsRef = collection(db, "friendRequests")
            const sentRequestQuery = query(
              requestsRef,
              where("from", "==", user.uid),
              where("to", "==", userDoc.id),
              where("status", "==", "pending"),
            )
            const sentRequestSnapshot = await getDocs(sentRequestQuery)
            requestSent = !sentRequestSnapshot.empty
          } catch (err) {
            console.warn("Error checking friend request status:", err)
          }
        }

        const isOnline = userData.isOnline || false
        results.push({
          id: userDoc.id,
          ...userData,
          isFriend,
          requestSent,
          isOnline,
        })
      }
    }

    await setCachedData(cacheKey, results)
    return results
  } catch (err) {
    console.error("Error searching users:", err)
    throw new Error("Error searching users. Please try again.")
  }
}

// Activity Type Resolution Helpers
export const resolveActivityTypeId = (value) => {
  const lowerValue = value?.toLowerCase()
  const found = ACTIVITY_TYPES.find(
    (activity) => activity.id === lowerValue || activity.name.toLowerCase() === lowerValue,
  )
  return found ? found.id : "walking" // Default to walking
}

export const resolveActivityDisplayName = (value) => {
  const lowerValue = value?.toLowerCase()
  const found = ACTIVITY_TYPES.find(
    (activity) => activity.id === lowerValue || activity.name.toLowerCase() === lowerValue,
  )
  return found ? found.name : "Walking" // Default to Walking
}

// Challenge Normalization Helper
export const normalizeChallengeForClient = (rawChallenge, id) => {
  const activityTypeId = resolveActivityTypeId(rawChallenge.activityType || rawChallenge.type)
  const activityDisplayName = resolveActivityDisplayName(rawChallenge.activityType || rawChallenge.type)
  const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activityTypeId) || ACTIVITY_TYPES[0] // Default to walking config

  return {
    id: id,
    ...rawChallenge,
    activityType: activityTypeId, // Ensure this is always the ID
    type: activityDisplayName, // Ensure this issetNewChallenge always the display name
    endDate: rawChallenge.endDate?.toDate ? rawChallenge.endDate.toDate() : new Date(rawChallenge.endDate),
    startDate: rawChallenge.startDate?.toDate
      ? rawChallenge.startDate.toDate()
      : new Date(rawChallenge.startDate || Date.now()),
    difficulty: rawChallenge.difficulty ? rawChallenge.difficulty.toLowerCase() : "medium", // Normalize difficulty
    goal: rawChallenge.goal ?? null,
    unit: activityConfig.unit, // Fallback to default unit
    progress: rawChallenge.progress || {},
    status: rawChallenge.status || { global: "pending" },
    participants: rawChallenge.participants || [],
    groupType: rawChallenge.groupType || "public",
    createdBy: rawChallenge.createdBy || "",
    stakeXP: rawChallenge.stakeXP || 0,
    individualStake: rawChallenge.individualStake || 0, // Ensure individual stake is present
  }
}

// Challenges Management
export const loadChallenges = async (callbacks) => {
  const { setChallenges } = callbacks

  try {
    const cachedChallenges = await getCachedData("challenges")
    if (cachedChallenges) {
      setChallenges(cachedChallenges)
    }

    const challengesRef = collection(db, "challenges")
    // 🔹 Always order by createdAt for consistent query results
    const challengesQuery = query(challengesRef, orderBy("createdAt", "desc"), limit(10))
    const challengesSnapshot = await getDocs(challengesQuery)

    const now = new Date()
    // CRITICAL FIX: Use the challenge document's 'endDate' for filtering
    const challengesData = challengesSnapshot.docs
      .map((doc) => normalizeChallengeForClient(doc.data(), doc.id))
      .filter((challenge) => challenge.endDate >= now)

    setChallenges(challengesData)
    await setCachedData("challenges", challengesData)

    const lastChallengeTime = challengesData.length > 0 ? challengesData[0].createdAt : Timestamp.fromDate(new Date(0))

    // 🔹 Add orderBy to match Firestore index requirements
    const newChallengesQuery = query(
      challengesRef,
      where("createdAt", ">", lastChallengeTime),
      orderBy("createdAt", "desc"),
      limit(10),
    )

    const challengesListener = onSnapshot(
      newChallengesQuery,
      (querySnapshot) => {
        if (querySnapshot.empty) return
        try {
          const now = new Date()
          const newChallengesData = querySnapshot.docs
            .map((doc) => normalizeChallengeForClient(doc.data(), doc.id))
            .filter((challenge) => challenge.endDate >= now)

          if (newChallengesData.length > 0) {
            setChallenges((prev) => {
              const combined = [...newChallengesData, ...prev]
              const unique = combined.filter((c, i, self) => i === self.findIndex((x) => x.id === c.id))
              setCachedData("challenges", unique)
              return unique
            })
          }
        } catch (err) {
          console.error("Error processing new challenges:", err)
        }
      },
      (error) => {
        console.error("Error in challenges listener:", error)
      },
    )

    return challengesListener
  } catch (err) {
    console.error("Error loading challenges:", err)
    return null
  }
}

// FIXED: createChallenge: Creator's stake is deducted immediately; enforces 24hr min join time.
export const createChallenge = async (challengeData, friendIds = [], groupType = "duo") => {
  try {
    if (!challengeData.title?.trim()) {
      throw new Error("Please enter a challenge title")
    }

    const user = auth.currentUser
    if (!user) throw new Error("User not authenticated.")

    const safeFriendIds = Array.isArray(friendIds) ? friendIds : []
    const serializedFriendIds = safeFriendIds.map((id) => String(id))

    const selectedGroupType = CHALLENGE_GROUP_TYPES.find((type) => type.id === groupType)
    if (!selectedGroupType) {
      throw new Error("Invalid challenge group type provided.")
    }

    const maxParticipants = selectedGroupType.maxParticipants

    if (selectedGroupType.id === "duo" && serializedFriendIds.length !== 1) {
      throw new Error("Duo challenges require exactly one invited friend.");
    }

    if (selectedGroupType.id === "lobby") {
      const minInvited = (selectedGroupType.minParticipants || 3) - 1;
      const maxInvited = maxParticipants - 1;

      if (serializedFriendIds.length < minInvited) {
        throw new Error(`Lobby challenges require at least ${minInvited} invited friends (3-5 total players).`);
      }
      if (serializedFriendIds.length > maxInvited) {
        throw new Error(`Lobby challenges can invite up to ${maxInvited} friends.`);
      }
    }

    const activityTypeId = resolveActivityTypeId(challengeData.type)
    const activityDisplayName = resolveActivityDisplayName(challengeData.type)
    const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activityTypeId) || ACTIVITY_TYPES[0]

    const now = new Date()
    const raceDurationMinutes = Number(challengeData.durationMinutes) || 30
    const individualStake = Number(challengeData.individualStake) || Number(challengeData.stakeXP) || 0
    const totalStake = individualStake * maxParticipants

    // START FIX: Determine mode and goal based on group type
    let finalGoal = null;
    let finalMode = "time";

    if (selectedGroupType.id === "solo") {
      finalMode = "goal";
      // Solo challenge requires a goal; use provided goal or default to 5
      finalGoal = Number(challengeData.goal) || 5;
    } else {
      // Duo/Lobby are time-based races, so they have no distance/reps goal
      finalMode = "time";
      finalGoal = null;
    }
    // END FIX

    // CRITICAL FIX: Separate Join/Race Duration
    const actualRaceEndTime = now.getTime() + raceDurationMinutes * 60 * 1000;
    const minVisibilityDurationMs = 24 * 60 * 60 * 1000;
    const joinCutoffTime = now.getTime() + minVisibilityDurationMs;
    // Set endDate as the maximum of race end time and minimum visibility time
    const visibilityCutoffTime = Math.max(actualRaceEndTime, joinCutoffTime);
    const endDate = new Date(visibilityCutoffTime);

    let participants = [user.uid]

    // XP Deduction for Creator (if multiplayer)
    if (selectedGroupType.id !== "solo" && individualStake > 0) {
      const result = await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists()) {
          throw new Error("Creator user document not found.");
        }

        const currentXP = Number(userSnap.data().xp || userSnap.data().totalXP) || 0;
        if (currentXP < individualStake) {
          throw new Error("Insufficient XP to stake for challenge creation.");
        }

        transaction.update(userRef, {
          xp: increment(-individualStake)
        });

        return { staked: true };
      });

      if (!result.staked) {
        throw new Error("Failed to deduct creator's stake.");
      }
    }

    // 🏗️ Build challenge document
    const newChallengeData = {
      title: challengeData.title,
      description: challengeData.description || "",
      activityType: activityTypeId,
      type: activityDisplayName,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      endDate: Timestamp.fromDate(endDate),
      startDate: selectedGroupType.id === "solo" ? serverTimestamp() : null,
      groupType: selectedGroupType.id,
      maxParticipants,

      participants: participants,
      invitedUsers: serializedFriendIds,

      // Stakes and Status
      individualStake: individualStake,
      stakeXP: totalStake, // This is the TOTAL PRIZE POOL
      xpDeducted: selectedGroupType.id === "solo", // true if solo, false if duo/lobby (deducted above)

      mode: finalMode,
      completionRequirement: finalMode === "time" ? "betterthanothers" : "complete_goal",
      goal: finalGoal,
      unit: activityConfig.unit || null,
      durationMinutes: raceDurationMinutes,

      progress: {},
      status: {
        global: selectedGroupType.id === "solo" ? "active" : "pending",
        [user.uid]: selectedGroupType.id !== "solo" && individualStake > 0 ? "staked" : "joined"
      },
      completedBy: [],
    }

    const challengeRef = await addDoc(collection(db, "challenges"), newChallengeData)

    if (serializedFriendIds.length > 0) {
      const currentUserDoc = await getDoc(doc(db, "users", user.uid))
      const currentUserData = currentUserDoc.data()

      const notificationPromises = serializedFriendIds.map(async (friendId) => {
        try {
          const notificationId = await NotificationService.sendChallengeInvitationNotification(
            friendId,
            {
              id: user.uid,
              username: currentUserData.username || currentUserData.displayName,
              displayName: currentUserData.displayName || currentUserData.username,
              avatar: currentUserData.avatar || DEFAULT_AVATAR,
            },
            {
              id: challengeRef.id,
              title: challengeData.title,
              type: activityDisplayName,
              groupType: selectedGroupType.name,
            },
          )

          if (notificationId) {
            console.log(`✅ Challenge invitation notification sent to ${friendId}: ${notificationId}`)
          } else {
            console.warn(`⚠️ Failed to send challenge invitation notification to ${friendId}`)
          }
        } catch (notificationError) {
          console.error(`❌ Error sending challenge invitation notification to ${friendId}:`, notificationError)
        }
      })

      await Promise.allSettled(notificationPromises)
    }

    return {
      success: true,
      message: `Challenge created and ${serializedFriendIds.length} friend(s) invited! Creator's stake deducted.`,
      challenge: {
        id: challengeRef.id,
        ...newChallengeData,
        endDate,
      },
    }
  } catch (err) {
    console.error("Error creating challenge:", err)
    throw new Error(err.message || "Failed to create challenge. Please try again.")
  }
}

// FIXED: joinChallenge performs XP deduction upon joining.
export const joinChallenge = async (challengeId) => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("You must be signed in to join challenges.")

    const challengeRef = doc(db, "challenges", challengeId)
    const userRef = doc(db, "users", user.uid)

    // Use transaction for atomic updates: XP deduction + Challenge/Participant update
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(challengeRef)
      const userSnap = await transaction.get(userRef)

      if (!snap.exists()) throw new Error("Challenge not found.")
      if (!userSnap.exists()) throw new Error("User document not found.")

      const challengeData = snap.data()
      const participants = challengeData.participants || []
      const individualStake = challengeData.individualStake || 0;

      // Check if challenge has expired based on its visible endDate
      const endDate = challengeData.endDate?.toDate ? challengeData.endDate.toDate() : new Date(challengeData.endDate);
      if (new Date() > endDate) {
        throw new Error("This challenge has expired and cannot be joined.")
      }

      if (participants.includes(user.uid)) {
        throw new Error("You have already joined this challenge.")
      }

      // Check if challenge is full
      if (challengeData.maxParticipants && participants.length >= challengeData.maxParticipants) {
        throw new Error("This challenge is already full.")
      }

      // Only public/lobby challenges can be joined via this function
      if (challengeData.groupType !== "lobby" && challengeData.groupType !== "public") {
        throw new Error("This is a private challenge. You must be invited.")
      }

      // XP Deduction Logic (Only if staking > 0)
      if (individualStake > 0) {
        const currentXP = Number(userSnap.data().xp || userSnap.data().totalXP) || 0;
        if (currentXP < individualStake) {
          throw new Error(`Insufficient XP (${individualStake}) to stake and join the challenge.`);
        }
        // Deduct XP
        transaction.update(userRef, { xp: increment(-individualStake) });
      }

      const newParticipants = [...participants, user.uid]

      // Update challenge document
      transaction.update(challengeRef, {
        participants: newParticipants,
        // Set user status to 'staked' and updated time
        [`status.${user.uid}`]: individualStake > 0 ? "staked" : "joined",
        updatedAt: serverTimestamp()
      });

      return { participants: newParticipants, individualStake }
    })

    return {
      success: true,
      message: `Successfully joined and staked ${result.individualStake} XP for the challenge!`,
      updatedParticipants: result.participants,
      challengeStarted: false,
    }
  } catch (err) {
    console.error("Error joining challenge:", err)
    throw {
      success: false,
      message: err.message || "Failed to join challenge. Please try again.",
      updatedParticipants: [],
      challengeStarted: false,
    }
  }
}

// FIXED: acceptChallengeInvite performs XP deduction upon accepting.
export const acceptChallengeInvite = async (challengeId) => {
  const user = auth.currentUser
  if (!user) throw new Error("You must be signed in to accept challenges.")

  const challengeRef = doc(db, "challenges", challengeId)
  const userRef = doc(db, "users", user.uid)

  // Use transaction for atomic updates: XP deduction + Challenge/Participant update
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(challengeRef)
    const userSnap = await transaction.get(userRef)

    if (!snap.exists()) throw new Error("Challenge not found.")
    if (!userSnap.exists()) throw new Error("User document not found.")

    const data = snap.data()
    const invited = data.invitedUsers || []
    const participants = data.participants || []
    const individualStake = data.individualStake || 0;

    // Check if challenge has expired based on its visible endDate
    const endDate = data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate);
    if (new Date() > endDate) {
      throw new Error("This challenge has expired and cannot be accepted.")
    }

    // Check if user is invited
    if (!invited.includes(user.uid)) {
      throw new Error("You are not invited to this challenge.")
    }

    // Check if challenge is full
    if (data.maxParticipants && participants.length >= data.maxParticipants) {
      // Still remove them from invited, but throw error
      transaction.update(challengeRef, {
        invitedUsers: invited.filter((id) => id !== user.uid),
      })
      throw new Error("This challenge is already full.")
    }

    // XP Deduction Logic (Only if staking > 0)
    if (individualStake > 0) {
      const currentXP = Number(userSnap.data().xp || userSnap.data().totalXP) || 0;
      if (currentXP < individualStake) {
        throw new Error(`Insufficient XP (${individualStake}) to stake and accept the challenge.`);
      }
      // Deduct XP
      transaction.update(userRef, { xp: increment(-individualStake) });
    }


    const updatedInvited = invited.filter((id) => id !== user.uid)
    const updatedParticipants = participants.includes(user.uid) ? participants : [...participants, user.uid] // Prevent duplicates

    // Update challenge document
    transaction.update(challengeRef, {
      invitedUsers: updatedInvited,
      participants: updatedParticipants,
      // Set user status to 'staked' and updated time
      [`status.${user.uid}`]: individualStake > 0 ? "staked" : "joined",
      updatedAt: serverTimestamp(),
    })
  })

  return { success: true, message: "Challenge accepted and stake deducted!" }
}

export const startChallenge = async (challengeId) => {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const challengeRef = doc(db, 'challenges', challengeId);

  await runTransaction(db, async (transaction) => {
    // 1. READ PHASE - Get challenge document
    const challengeSnap = await transaction.get(challengeRef);
    if (!challengeSnap.exists()) throw new Error("Challenge not found.");

    const challenge = challengeSnap.data();

    // --- Validation ---

    // 1. Only creator can start
    if (challenge.createdBy !== user.uid) {
      throw new Error("Only the creator can start this challenge.");
    }

    // 2. Check for accepted invites
    // (Optional: You can remove this check if you want to start even if some haven't accepted yet, 
    // but usually we wait for the Invited list to be empty or explicit participants count)
    if (challenge.invitedUsers?.length > 0) {
      // Ideally, we just check if we have ENOUGH participants below, 
      // rather than forcing everyone invited to accept. 
      // But if you want to enforce "Wait for everyone", keep this. 
      // For a flexible Lobby, you might want to remove this or rely on participant count.
      // Let's keep it strict for Duo, flexible for Lobby:
      if (challenge.groupType === 'duo') {
        throw new Error("All invited players must accept first.");
      }
    }

    const participantCount = challenge.participants?.length || 0;

    // 3. Minimum Player Checks
    if (challenge.groupType === 'duo' && participantCount !== 2) {
      throw new Error("Duo challenges require exactly 2 players to start.");
    }

    if (challenge.groupType === 'lobby' && participantCount < 3) {
      throw new Error("Lobby challenges require at least 3 players to start.");
    }

    // 4. Status Check
    if (challenge.status?.global === 'active') {
      throw new Error("Challenge is already active.");
    }

    // --- WRITE PHASE ---
    transaction.update(challengeRef, {
      'status.global': 'active',
      startDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
};


export const completeChallenge = async (challengeId, userId) => {
  try {
    console.log(`Starting challenge completion check for user ${userId} on challenge ${challengeId}`)

    return await runTransaction(db, async (transaction) => {
      // Check idempotency receipt
      const receiptId = `${challengeId}_${userId}`
      const receiptRef = doc(db, "challenge_receipts", receiptId)
      const receiptDoc = await transaction.get(receiptRef)

      if (receiptDoc.exists()) {
        const receiptData = receiptDoc.data()
        return {
          success: receiptData.success,
          message: receiptData.message,
          xpReward: receiptData.xpReward || 0,
          xpPenalty: receiptData.xpPenalty || 0,
          alreadyProcessed: true,
        }
      }

      // Read challenge + user
      const challengeRef = doc(db, "challenges", challengeId)
      const userRef = doc(db, "users", userId)
      const [challengeDoc, userDoc] = await Promise.all([transaction.get(challengeRef), transaction.get(userRef)])

      if (!challengeDoc.exists()) throw new Error("Challenge not found.")
      if (!userDoc.exists()) throw new Error("User not found.")

      const challengeData = challengeDoc.data()
      const userData = userDoc.data()

      // Timers
      const startDate = challengeData.startDate?.toMillis?.()
      const durationMs = (challengeData.durationMinutes || 0) * 60000
      const timerCutoff = startDate ? startDate + durationMs : null
      const endDate = challengeData.endDate?.toMillis?.()
      const now = Date.now()

      // Progress
      const userProgress = challengeData.progress?.[userId] || 0
      const normalizedProgress = normalizeUnits(userProgress, challengeData.unit)
      const normalizedGoal = normalizeUnits(challengeData.goal, challengeData.unit)

      const isCompleted = checkChallengeCompletion(challengeData, userId, normalizedProgress, normalizedGoal)

      const isTimerExpired = timerCutoff && now > timerCutoff
      const isLobbyExpired = endDate && now > endDate
      const isExpired = isTimerExpired || isLobbyExpired

      const stakeXP = challengeData.stakeXP || 100 // default fallback
      let receiptData = {
        challengeId,
        userId,
        processedAt: serverTimestamp(),
        success: false,
        xpReward: 0,
        xpPenalty: 0,
      }

      // ⚠️ Note: For Time-based (Duos/Lobbies) the completion and reward logic is in `finalizeTimeChallenge`.
      // This `completeChallenge` is mainly for old quest-style challenges.
      // We keep the logic for goal-based challenges but ensure it doesn't conflict with time-based.
      if (challengeData.mode !== "time" || challengeData.groupType === "solo") {
        if (isCompleted && !isExpired) {
          // ✅ Reward stake XP (Solo/Goal-based)
          const xpReward = stakeXP
          const newTotalXP = (userData.totalXP || 0) + xpReward

          transaction.update(userRef, {
            totalXP: newTotalXP,
            completedChallenges: arrayUnion(challengeId),
          })

          transaction.update(challengeRef, {
            completedBy: arrayUnion(userId),
            [`status.${userId}`]: "completed",
            [`completedAt.${userId}`]: serverTimestamp(),
          })

          receiptData = {
            ...receiptData,
            success: true,
            xpReward,
            message: `Challenge completed! +${xpReward} XP`,
          }
        } else if (isExpired && !isCompleted) {
          // Goal-based failure
          const xpPenalty = stakeXP
          const newTotalXP = Math.max(0, (userData.totalXP || 0) - xpPenalty)

          transaction.update(userRef, { totalXP: newTotalXP })

          transaction.update(challengeRef, {
            [`status.${userId}`]: "failed",
            [`failedAt.${userId}`]: serverTimestamp(),
            "status.global": "ended",
          })

          receiptData = {
            ...receiptData,
            success: false,
            xpPenalty,
            message: `Challenge failed. -${xpPenalty} XP`,
          }
        } else {
          receiptData = {
            ...receiptData,
            message: "Challenge not yet completed.",
          }
        }
      } else {
        receiptData = {
          ...receiptData,
          message: "Time-based challenge, waiting for finalization.",
        }
      }

      transaction.set(receiptRef, receiptData)
      return receiptData
    })
  } catch (err) {
    console.error("Error completing challenge:", err)
    throw new Error(err.message || "Failed to complete challenge.")
  }
}

export const updateChallengeProgress = async (challengeId, userId, progress) => {
  try {
    console.log(`Updating progress for user ${userId} on challenge ${challengeId} to ${progress}`)

    return await runTransaction(db, async (transaction) => {
      const challengeRef = doc(db, "challenges", challengeId)
      const challengeDoc = await transaction.get(challengeRef)

      if (!challengeDoc.exists()) {
        throw new Error("Challenge not found.")
      }

      const challengeData = challengeDoc.data()

      const normalizedProgress = normalizeUnits(progress, challengeData.unit)
      const normalizedGoal = normalizeUnits(challengeData.goal, challengeData.unit)

      // CRITICAL: Progress is always accumulated from the activity completion
      // This function is generally for manual, non-activity-driven progress updates,
      // but if used by ActivityScreen, it should accumulate progress safely.
      // Since this is called from XPManager, it's already accumulating.

      transaction.update(challengeRef, {
        // XPManager already computes and updates the newProgress, we assume that progress here is the FINAL accumulated progress from the activity.
        // The XPManager handles the accumulation and calls this as a log/status update
        [`progress.${userId}`]: normalizedProgress,
        [`status.${userId}`]: normalizedProgress >= normalizedGoal ? "completed" : "in_progress",
        updatedAt: serverTimestamp(),
      })

      const completionRequirement = challengeData.completionRequirement || "complete_goal"
      const endDate = challengeData.endDate?.toDate ? challengeData.endDate.toDate() : new Date(challengeData.endDate)
      const now = new Date()
      const isExpired = now > endDate

      // We remove the complex, duplicated finalization logic here.
      // Finalization should be handled by an explicit call to `finalizeTimeChallenge` or a scheduled function.

      return {
        success: true,
        normalizedProgress,
        normalizedGoal,
        isCompleted: normalizedProgress >= normalizedGoal,
      }
    })
  } catch (err) {
    console.error("Error updating challenge progress:", err)
    throw new Error(err.message || "Failed to update challenge progress.")
  }
}

const normalizeUnits = (value, unit) => {
  if (!value || !unit) return 0

  switch (unit.toLowerCase()) {
    case "meters":
    case "m":
      return value / 1000
    case "kilometers":
    case "km":
      return value
    case "seconds":
    case "s":
      return value / 60
    case "minutes":
    case "min":
      return value
    case "hours":
    case "h":
      return value * 60
    default:
      return value
  }
}

const checkChallengeCompletion = (challengeData, userId, normalizedProgress, normalizedGoal) => {
  const completionRequirement = challengeData.completionRequirement || "complete_goal"

  switch (completionRequirement) {
    case "complete_goal":
      return normalizedProgress >= normalizedGoal

    case "better_than_others":
      // For time-based challenges, this is resolved by `finalizeTimeChallenge`
      return false

    case "time_based":
      // For time-based challenges, this is resolved by `finalizeTimeChallenge`
      return false

    default:
      return normalizedProgress >= normalizedGoal
  }
}

export const getUserChallenges = async (userId) => {
  try {
    console.log(`Getting active challenges for user ${userId}`)

    const challengesRef = collection(db, "challenges")
    const now = new Date()

    const userChallengesQuery = query(
      challengesRef,
      where("participants", "array-contains", userId),
      where("endDate", ">", Timestamp.fromDate(now)),
    )

    const challengesSnapshot = await getDocs(userChallengesQuery)
    const challengesData = challengesSnapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        endDate: data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate),
      }
    })

    console.log(`Found ${challengesData.length} active challenges for user ${userId}`)
    return challengesData
  } catch (err) {
    console.error("Error getting user challenges:", err)
    throw new Error(err.message || "Failed to get challenges.")
  }
}

export const loadLeaderboardData = async (callbacks) => {
  const { setLeaderboard, setError } = callbacks;
  try {
    const cachedLeaderboard = await getCachedData("leaderboard");
    if (cachedLeaderboard) {
      setLeaderboard(cachedLeaderboard);
    }

    const user = auth.currentUser;
    if (!user) return;

    const userDistances = {};
    const userExp = {};
    const userNames = {};
    const userAvatars = {};
    const userDocs = {};
    const userOnlineStatus = {};

    const usersRef = collection(db, "users");
    const usersQuery = query(usersRef, limit(50));
    const usersSnapshot = await getDocs(usersQuery);

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      userNames[userId] = userData.displayName || userData.username || "User";
      userAvatars[userId] = userData.avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";
      userDocs[userId] = userData;

      // FIXED: Use 'xp' (available XP) instead of 'totalXP'
      userExp[userId] = userData.xp || 0;

      userOnlineStatus[userId] = userData.isOnline || false;
      userDistances[userId] = userData.totalDistance || 0;
    }

    const allUserIds = Object.keys(userNames);
    const leaderboardData = allUserIds.map((userId) => ({
      id: userId,
      name: userNames[userId] || "User",
      avatar: userAvatars[userId],
      distance: userDistances[userId] || 0,
      xp: userExp[userId] || 0, // Changed from 'exp' to 'xp' for clarity
      exp: userExp[userId] || 0, // Keep 'exp' for backward compatibility
      isCurrentUser: userId === user.uid,
      isOnline: userOnlineStatus[userId] || false,
      level: userDocs[userId]?.level || 1,
      totalActivities: userDocs[userId]?.totalActivities || 0,
      totalXP: userDocs[userId]?.totalXP || 0, // Keep totalXP as reference
    }));

    // Sort by available XP (xp field)
    leaderboardData.sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      return b.distance - a.distance;
    });

    const topLeaderboard = leaderboardData.slice(0, 15);
    setLeaderboard(topLeaderboard);
    await setCachedData("leaderboard", topLeaderboard);
  } catch (err) {
    console.warn("Error creating leaderboard:", err);
    setError("Error loading leaderboard " + err.message);
  }
};


// Delete Challenge Management
export const deleteChallenge = async (challengeId) => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("You must be signed in to delete challenges.")

    const challengeRef = doc(db, "challenges", challengeId)
    const challengeDoc = await getDoc(challengeRef)

    if (!challengeDoc.exists()) {
      throw new Error("Challenge not found.")
    }

    const challengeData = challengeDoc.data()

    // Check if user is the creator
    if (challengeData.createdBy !== user.uid) {
      throw new Error("Only the creator can delete this challenge.")
    }

    // Delete the challenge from Firestore
    await deleteDoc(challengeRef)

    return { success: true, message: "Challenge deleted successfully!" }
  } catch (err) {
    console.error("Error deleting challenge:", err)
    throw new Error(err.message || "Failed to delete challenge. Please try again.")
  }
}

// Online Status Management
export const setUserOnlineStatus = async () => {
  try {
    const user = auth.currentUser
    if (!user) return

    const userRef = doc(db, "users", user.uid)
    await updateDoc(userRef, {
      isOnline: true,
      lastSeen: serverTimestamp(),
    })
  } catch (err) {
    console.warn("Error setting online status:", err)
  }
}

export const setUserOfflineStatus = async () => {
  try {
    const user = auth.currentUser
    if (!user) return

    const userRef = doc(db, "users", user.uid)
    await updateDoc(userRef, {
      isOnline: false,
      lastSeen: serverTimestamp(),
    })
  } catch (err) {
    console.warn("Error updating offline status:", err)
  }
}

// Utility Functions
export const formatLastActive = (timestamp) => {
  if (!timestamp) return "Never active"
  const now = new Date()
  const lastActive = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const diffMs = now - lastActive
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffMins / 1440) // 60 * 24

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  return lastActive.toLocaleDateString()
}

export const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`
}

export const formatActivityDescription = (activity) => {
  if (!activity) return "No recent activity"

  // Use activityType (ID) for lookup, fallback to 'type' (display name)
  const activityTypeId = resolveActivityTypeId(activity.activityType || activity.type)
  const activityDisplayName = resolveActivityDisplayName(activity.activityType || activity.type)

  // Treat activity.distance as meters and convert to km for display
  const distanceInMeters = typeof activity.distance === "number" && !isNaN(activity.distance) ? activity.distance : 0
  const distanceInKm = (distanceInMeters / 1000).toFixed(2)

  const timeAgo = activity.createdAt ? formatLastActive(activity.createdAt) : "Unknown time"

  return `${activityDisplayName} ${distanceInKm} km • ${timeAgo}`
}


export const finalizeTimeChallenge = async (challengeId) => {
  console.log(`Finalizing time challenge: ${challengeId}`)

  try {
    const challengeRef = doc(db, "challenges", challengeId)

    // Use a transaction to ensure atomicity
    const finalizationResult = await runTransaction(db, async (transaction) => {
      const challengeSnap = await transaction.get(challengeRef)

      if (!challengeSnap.exists()) {
        throw new Error("Challenge not found.")
      }

      const challengeData = challengeSnap.data()

      // Prevent re-running if already completed
      if (challengeData.status?.global === "completed") {
        console.warn(`Challenge ${challengeId} is already completed.`)
        return { success: false, message: "Challenge already completed.", winnerId: challengeData.winnerId }
      }

      const participants = challengeData.participants || []
      const progressMap = challengeData.progress || {}
      const prizePool = challengeData.stakeXP || 0 // The total pot

      if (participants.length === 0) {
        throw new Error("No participants in this challenge.")
      }

      // --- 1. Find the Winner ---
      let winnerId = null
      let highestScore = -1

      for (const participantId of participants) {
        const score = progressMap[participantId] || 0
        if (score > highestScore) {
          highestScore = score
          winnerId = participantId
        }
      }

      // Handle no winner or a 0-0 tie (if multiple people tied at 0)
      const tiedAtZero = participants.filter(id => (progressMap[id] || 0) === 0).length === participants.length;

      if (!winnerId || highestScore === 0 || tiedAtZero) {
        console.log(`No winner found for ${challengeId}. Highest score was ${highestScore}.`)

        // Mark challenge as completed with no winner (stakes are lost or could be refunded)
        transaction.update(challengeRef, {
          "status.global": "completed",
          winnerId: null, // No winner
          updatedAt: serverTimestamp(),
        })

        return { success: true, message: "Challenge ended with no winner.", winnerId: null }
      }

      console.log(`Winner for ${challengeId} is: ${winnerId} with score ${highestScore}`)

      // --- 2. Pay the Winner ---
      const winnerUserRef = doc(db, "users", winnerId)

      // We must read the user doc *within* the transaction before updating it
      const winnerSnap = await transaction.get(winnerUserRef)
      if (!winnerSnap.exists()) {
        // This is bad, but we must continue to close the challenge
        console.error(`Winner's user document (ID: ${winnerId}) not found! Cannot award XP.`)
      } else {
        // Use Firebase 'increment' for a safe, atomic update
        transaction.update(winnerUserRef, {
          xp: increment(prizePool), // Atomically adds prizePool to current XP
        })
      }

      // --- 3. Update the Challenge Document ---
      transaction.update(challengeRef, {
        "status.global": "completed",
        winnerId: winnerId,
        highestScore: highestScore,
        updatedAt: serverTimestamp(),
      })

      return { success: true, message: `Payout successful for ${winnerId}`, winnerId, prizePool }
    })

    console.log("Finalization transaction successful:", finalizationResult)
    return finalizationResult
  } catch (error) {
    console.error("Error finalizing time challenge:", error)
    throw new Error(error.message || "Failed to finalize challenge.")
  }
}

export const loadPastChallenges = async (userId) => {
  try {
    const challengesRef = collection(db, "challenges")
    const now = new Date()

    // Query 1: Challenges where user participated and challenge has ended
    const q1 = query(
      challengesRef,
      where("participants", "array-contains", userId),
      where("endDate", "<", now),
      orderBy("endDate", "desc"),
    )

    // Query 2: Challenges where user participated and status is completed
    const q2 = query(
      challengesRef,
      where("participants", "array-contains", userId),
      where("status.global", "==", "completed"),
      orderBy("endDate", "desc"),
    )

    // Execute both queries
    const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)])

    // Combine results and deduplicate
    const challengesMap = new Map()

    snapshot1.docs.forEach((doc) => {
      const challenge = { id: doc.id, ...doc.data() }
      challengesMap.set(challenge.id, challenge)
    })

    snapshot2.docs.forEach((doc) => {
      const challenge = { id: doc.id, ...doc.data() }
      challengesMap.set(challenge.id, challenge)
    })

    // Convert to array and normalize each challenge
    const challenges = Array.from(challengesMap.values()).map((challenge) =>
      normalizeChallengeForClient(challenge, challenge.id),
    )

    return challenges
      .sort((a, b) => {
        const dateA = a.endDate instanceof Date ? a.endDate : new Date(a.endDate)
        const dateB = b.endDate instanceof Date ? b.endDate : new Date(b.endDate)
        return dateB - dateA
      })
      .map((challenge) => computeChallengePastFields(challenge, userId))
  } catch (error) {
    console.error("Failed to load past challenges:", error)
    return []
  }
}

const computeChallengePastFields = (challenge, userId) => {
  const userProgress = challenge.progress?.[userId] ?? 0
  const userStatus = challenge.status?.[userId] ?? "not_started"

  let endDate = challenge.endDate
  if (endDate instanceof Date) {
    // Already a Date
  } else if (endDate?.toDate && typeof endDate.toDate === "function") {
    // Firebase Timestamp
    endDate = endDate.toDate()
  } else if (endDate) {
    // Try to parse as string or number
    endDate = new Date(endDate)
  } else {
    // Fallback to now if no end date
    endDate = new Date()
  }

  let startDate = challenge.startDate
  if (startDate instanceof Date) {
    // Already a Date
  } else if (startDate?.toDate && typeof startDate.toDate === "function") {
    // Firebase Timestamp
    startDate = startDate.toDate()
  } else if (startDate) {
    // Try to parse as string or number
    startDate = new Date(startDate)
  } else {
    // Fallback to endDate - 7 days if no start date
    startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  // Validate dates are valid
  if (isNaN(endDate.getTime())) {
    endDate = new Date()
  }
  if (isNaN(startDate.getTime())) {
    startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  // Calculate duration in minutes
  const durationMs = Math.max(0, endDate - startDate)
  const durationMinutes = Math.floor(durationMs / (1000 * 60))

  const goal = challenge.goal ?? 1
  const safeGoal = Math.max(goal, 1) // Ensure goal is at least 1 to avoid division by zero
  const progressPercent = Math.min(Math.round((userProgress / safeGoal) * 100), 100)

  let result = "expired"

  // Check if user won or completed
  if (userStatus === "completed" || userStatus === "won" || userProgress >= safeGoal) {
    result = "won"
  }
  // Check if user failed or lost
  else if (userStatus === "failed" || userStatus === "lost") {
    result = "lost"
  }
  // Check if challenge globally completed
  else if (challenge.status?.global === "completed") {
    // If completed globally, determine win/loss based on winnerId
    if (challenge.winnerId) {
      result = challenge.winnerId === userId ? "won" : "lost"
    } else {
      result = "completed" // Completed but no winner (e.g., tie or all 0s)
    }
  }
  // Default to expired (challenge ended without user reaching goal)
  else {
    result = "expired"
  }

  return {
    // Required output fields
    id: challenge.id,
    title: challenge.title || "Untitled Challenge",
    activityType: challenge.activityType,
    groupType: challenge.groupType || "public",
    startDate: startDate,
    endDate: endDate,
    participants: challenge.participants || [],
    stakeXP: challenge.stakeXP || 0,
    creator: challenge.createdBy || "Unknown",
    userProgress: userProgress,
    userStatus: userStatus,
    winnerId: challenge.winnerId || null, // Include winner ID for display

    // Computed fields
    result: result,
    durationMinutes: Math.max(0, durationMinutes), // Ensure non-negative
    progressPercent: progressPercent,

    // Additional fields for UI rendering
    description: challenge.description || "",
    difficulty: challenge.difficulty || "medium",
    unit: challenge.unit || "km",
    goal: safeGoal,
    maxParticipants: challenge.maxParticipants,
  }
}

/**
 * Helper function to determine the color associated with a challenge result
 * @param {string} result - The result status (won, lost, completed, expired)
 * @returns {string} - Hex color code for the result
 */
export const getResultColor = (result) => {
  switch (result) {
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

/**
 * Helper function to get human-readable label for a challenge result
 * @param {string} result - The result status (won, lost, completed, expired)
 * @returns {string} - Readable label for display
 */
const getResultLabel = () => {
  // ✅ FIX: Prioritize the computed result from the backend (item.result)
  switch (item.result) {
    case "won":
      return "You Won!"
    case "lost":
      return "Lost"
    case "completed":
      return "Completed"
    case "expired":
    default:
      if (winnerInfo) {
        return winnerInfo.isCurrentUser ? "You Won!" : `${winnerInfo.name} Won`
      }
      return "Expired"
  }
}

/**
 * Helper function to compute challenge progress percentage with safeguards
 * @param {number} userProgress - User's current progress value
 * @param {number} goal - Challenge goal value
 * @returns {number} - Progress percentage (0-100)
 */
export const computeProgressPercent = (userProgress, goal) => {
  const safeGoal = Math.max(goal ?? 1, 1) // Ensure goal is at least 1
  const safeProgress = Math.max(userProgress ?? 0, 0) // Ensure progress is non-negative
  const percent = (safeProgress / safeGoal) * 100
  return Math.min(Math.round(percent), 100) // Cap at 100%
}

/**
 * Helper function to compute challenge status based on progress and conditions
 * @param {number} userProgress - User's current progress
 * @param {number} goal - Challenge goal
 * @param {string} userStatus - User's status in the challenge
 * @param {object} challengeStatus - Challenge's global status object
 * @returns {string} - Computed result status (won, lost, completed, expired)
 */
export const computeResultStatus = (userProgress, goal, userStatus, challengeStatus) => {
  // Default to expired
  let result = "expired"

  // Check if user won or met goal
  const safeGoal = Math.max(goal ?? 1, 1)
  const metGoal = userProgress >= safeGoal

  if (userStatus === "completed" || userStatus === "won" || metGoal) {
    result = "won"
  } else if (userStatus === "failed" || userStatus === "lost") {
    result = "lost"
  } else if (challengeStatus?.global === "completed") {
    result = "completed"
  }

  return result
}

/**
 * Helper function to calculate duration between two dates in minutes
 * @param {Date|Timestamp} startDate - Challenge start date
 * @param {Date|Timestamp} endDate - Challenge end date
 * @returns {number} - Duration in minutes (non-negative)
 */
export const computeDurationMinutes = (startDate, endDate) => {
  try {
    let start = startDate
    let end = endDate

    // Convert Firebase Timestamps to Date objects
    if (start?.toDate && typeof start.toDate === "function") {
      start = start.toDate()
    } else if (!(start instanceof Date)) {
      start = new Date(start || 0)
    }

    if (end?.toDate && typeof end.toDate === "function") {
      end = end.toDate()
    } else if (!(end instanceof Date)) {
      end = new Date(end || Date.now())
    }

    // Ensure both are valid Date objects
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 0
    }

    const durationMs = Math.max(0, end - start)
    return Math.floor(durationMs / (1000 * 60))
  } catch (error) {
    console.warn("[v0] Error computing duration:", error)
    return 0
  }
}

/**
 * Helper function to safely convert and validate a date value
 * @param {Date|Timestamp|string|number} dateValue - The date to convert
 * @param {Date|Timestamp|string|number} fallback - Fallback value if conversion fails
 * @returns {Date} - Valid Date object
 */
export const safeConvertDate = (dateValue, fallback = new Date()) => {
  try {
    if (dateValue instanceof Date) {
      if (isNaN(dateValue.getTime())) {
        return new Date(fallback)
      }
      return dateValue
    }

    if (dateValue?.toDate && typeof dateValue.toDate === "function") {
      const converted = dateValue.toDate()
      if (isNaN(converted.getTime())) {
        return new Date(fallback)
      }
      return converted
    }

    const parsed = new Date(dateValue)
    if (isNaN(parsed.getTime())) {
      return new Date(fallback)
    }
    return parsed
  } catch (error) {
    console.warn("[v0] Error converting date:", error)
    return new Date(fallback)
  }
}

/**
 * Helper function to determine if a challenge is expired
 * @param {Date} endDate - Challenge end date
 * @returns {boolean} - True if challenge is expired
 */
export const isChallengeExpired = (endDate) => {
  try {
    const end = safeConvertDate(endDate)
    const now = new Date()
    return now > end
  } catch (error) {
    console.warn("[v0] Error checking expiration:", error)
    return false
  }
}

/**
 * Helper function to get remaining time string for a challenge
 * @param {Date} endDate - Challenge end date
 * @returns {string} - Human-readable remaining time
 */
export const getRemainingTimeString = (endDate) => {
  try {
    const end = safeConvertDate(endDate)
    const now = new Date()
    const diffMs = end - now

    if (diffMs < 0) return "Ended"

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (days > 0) {
      return `${days}d ${hours}h`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  } catch (error) {
    console.warn("[v0] Error computing remaining time:", error)
    return "N/A"
  }
}

/**
 * Helper function to format a date for display
 * @param {Date|Timestamp|string|number} dateValue - Date to format
 * @param {string} locale - Locale for formatting (default: "en-US")
 * @returns {string} - Formatted date string
 */
export const formatDateForDisplay = (dateValue, locale = "en-US") => {
  try {
    const date = safeConvertDate(dateValue)
    return date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch (error) {
    console.warn("[v0] Error formatting date:", error)
    return "N/A"
  }
}

/**
 * Helper function to validate challenge data completeness
 * @param {object} challenge - Challenge object to validate
 * @returns {object} - Object with isValid boolean and error message (if invalid)
 */
export const validateChallengeData = (challenge) => {
  if (!challenge) {
    return { isValid: false, error: "Challenge data is missing" }
  }

  if (!challenge.id) {
    return { isValid: false, error: "Challenge ID is missing" }
  }

  if (!challenge.title) {
    return { isValid: false, error: "Challenge title is missing" }
  }

  if (!challenge.endDate) {
    return { isValid: false, error: "Challenge end date is missing" }
  }

  if (!challenge.participants || !Array.isArray(challenge.participants)) {
    return { isValid: false, error: "Challenge participants data is invalid" }
  }

  if (typeof challenge.goal !== "number" || challenge.goal <= 0) {
    return { isValid: false, error: "Challenge goal is invalid" }
  }

  return { isValid: true }
}

/**
 * Helper function to get activity info by type ID
 * @param {string} activityTypeId 
 * @param {array} activities 
 * @returns {object} 
 */
export const getActivityConfig = (activityTypeId, activities) => {
  if (!activities || !Array.isArray(activities)) {
    return {
      id: "unknown",
      name: "Activity",
      color: "#FFC107",
      unit: "km",
    }
  }

  const found = activities.find((a) => a.id === activityTypeId)
  return (
    found || {
      id: "unknown",
      name: "Activity",
      color: "#FFC107",
      unit: "km",
    }
  )
}

export const checkAllParticipantsSubmitted = (challengeData) => {
  try {
    // Must have exactly 2 participants
    if (!Array.isArray(challengeData.participants) || challengeData.participants.length !== 2) {
      return false
    }

    const participants = challengeData.participants
    const progressMap = challengeData.progress || {}

    // Both participants must have score > 0
    for (const participantId of participants) {
      const score = progressMap[participantId] || 0
      if (score <= 0) {
        return false
      }
    }

    return true
  } catch (error) {
    console.error("[checkAllParticipantsSubmitted] Error:", error)
    return false
  }
}

export const finalizeChallengeImmediate = async (transaction, challengeRef, challengeData) => {
  console.log("CommunityBackend: Starting immediate finalization for challenge", challengeData.id);

  const { participants, progress, stakeXP, groupType } = challengeData;

  // Validate it's a duo challenge
  if (groupType !== "duo" || participants.length !== 2) {
    console.warn("CommunityBackend: Not a duo challenge, skipping immediate finalization");
    return { success: false, reason: "Not a duo challenge" };
  }

  // Determine winner based on progress
  const participant1 = participants[0];
  const participant2 = participants[1];
  const progress1 = progress?.[participant1] || 0;
  const progress2 = progress?.[participant2] || 0;

  console.log("CommunityBackend: Progress comparison", {
    participant1,
    progress1,
    participant2,
    progress2,
  });

  let winnerId = null;
  let loserId = null;

  if (progress1 > progress2) {
    winnerId = participant1;
    loserId = participant2;
  } else if (progress2 > progress1) {
    winnerId = participant2;
    loserId = participant1;
  } else {
    // It's a tie
    console.log("CommunityBackend: Challenge ended in a tie");
    transaction.update(challengeRef, {
      "status.global": "completed",
      winnerId: null,
      completedAt: serverTimestamp(),
    });
    return { success: true, winnerId: null, tie: true };
  }

  console.log("CommunityBackend: Winner determined", { winnerId, loserId });

  // ✅ XP TRANSFER - Duo only
  if (stakeXP && stakeXP > 0) {
    const winnerRef = doc(db, "users", winnerId);
    const loserRef = doc(db, "users", loserId);

    // Get current user data within transaction
    const winnerSnap = await transaction.get(winnerRef);
    const loserSnap = await transaction.get(loserRef);

    if (!winnerSnap.exists() || !loserSnap.exists()) {
      throw new Error("User not found during XP transfer");
    }

    const winnerData = winnerSnap.data();
    const loserData = loserSnap.data();

    const winnerXP = winnerData.totalXP || 0;
    const loserXP = loserData.totalXP || 0;

    // Calculate new XP
    const newWinnerXP = winnerXP + stakeXP;
    const newLoserXP = Math.max(0, loserXP - stakeXP); // ✅ Can't go negative

    console.log("CommunityBackend: XP Transfer", {
      winnerId,
      winnerXP,
      newWinnerXP,
      loserId,
      loserXP,
      newLoserXP,
      stakeXP,
    });

    // Update both users atomically
    transaction.update(winnerRef, {
      totalXP: newWinnerXP,
      updatedAt: serverTimestamp(),
    });
    transaction.update(loserRef, {
      totalXP: newLoserXP,
      updatedAt: serverTimestamp(),
    });
  }

  // Update challenge status
  transaction.update(challengeRef, {
    "status.global": "completed",
    winnerId: winnerId,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log("CommunityBackend: Challenge finalized successfully", { winnerId, stakeXP });

  return { success: true, winnerId, stakeXP };
};



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

// New: Challenge group types with their configurations
export const CHALLENGE_GROUP_TYPES = [
  { id: "duo", name: "Duo Challenge", maxParticipants: 2, description: "A challenge for you and one friend." },
  {
    id: "lobby",
    name: "Lobby Challenge",
    maxParticipants: 5,
    description: "A challenge for you and up to 4 friends.",
  },
]

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
    // Check cache first
    const cachedFriends = await getCachedData("friends")
    if (cachedFriends) {
      const validCachedFriends = cachedFriends.filter((friend) => friendIds.includes(friend.id))
      if (validCachedFriends.length > 0) {
        setFriends(validCachedFriends)
        // Load all friends in the background to refresh cache
        loadAllFriends(friendIds, callbacks, true)
        return
      }
    }

    // Load all friends if no valid cache
    await loadAllFriends(friendIds, callbacks, false)
  } catch (err) {
    console.error("Error loading initial friends:", err)
    throw err // Let the caller handle the error
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
    const usersSnapshot = await getDocs(query(usersRef, limit(20)))

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
    difficulty: rawChallenge.difficulty ? rawChallenge.difficulty.toLowerCase() : "medium", // Normalize difficulty
    goal: rawChallenge.goal ?? null,
    unit: activityConfig.unit, // Fallback to default unit
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
    const challengesQuery = query(challengesRef, limit(5))
    const challengesSnapshot = await getDocs(challengesQuery)

    const now = new Date()
    const challengesData = challengesSnapshot.docs
      .map((doc) => normalizeChallengeForClient(doc.data(), doc.id))
      .filter((challenge) => challenge.endDate >= now)

    setChallenges(challengesData)
    await setCachedData("challenges", challengesData)

    const lastChallengeTime = challengesData.length > 0 ? challengesData[0].createdAt : Timestamp.fromDate(new Date(0))

    const newChallengesQuery = query(challengesRef, where("createdAt", ">", lastChallengeTime), limit(5))
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
              const uniqueChallenges = combined.filter(
                (challenge, index, self) => index === self.findIndex((c) => c.id === challenge.id),
              )
              setCachedData("challenges", uniqueChallenges)
              return uniqueChallenges
            })
          }
        } catch (err) {
          console.error("Error processing challenges:", err)
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

export const createChallenge = async (challengeData, friendIds = [], groupType = "duo") => {
  try {
    // 🧩 Validate title
    if (!challengeData.title?.trim()) {
      throw new Error("Please enter a challenge title")
    }

    const user = auth.currentUser
    if (!user) throw new Error("User not authenticated.")

    // ✅ Ensure friend IDs are valid strings
    const safeFriendIds = Array.isArray(friendIds) ? friendIds : []
    const serializedFriendIds = safeFriendIds.map((id) => String(id))

    // ✅ Validate group type
    const selectedGroupType = CHALLENGE_GROUP_TYPES.find((type) => type.id === groupType)
    if (!selectedGroupType) {
      throw new Error("Invalid challenge group type provided.")
    }

    const maxParticipants = selectedGroupType.maxParticipants

    // ✅ Enforce participant limits
    if (selectedGroupType.id === "duo" && serializedFriendIds.length !== 1) {
      throw new Error("Duo challenges require exactly one invited friend.")
    }
    if (selectedGroupType.id === "lobby" && serializedFriendIds.length > maxParticipants - 1) {
      throw new Error(`Lobby challenges can invite up to ${maxParticipants - 1} friends.`)
    }

    // ✅ Resolve activity type
    const activityTypeId = resolveActivityTypeId(challengeData.type)
    const activityDisplayName = resolveActivityDisplayName(challengeData.type)
    const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activityTypeId) || ACTIVITY_TYPES[0]

    const now = new Date()
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 1-day default

    // 🧍‍♂️ All participants (creator + invited)
    const allInvitedUsers = [user.uid, ...serializedFriendIds]

    // 💰 Compute proper stakes
    const individualStake = Number(challengeData.individualStake) || Number(challengeData.stakeXP) || 0
    const participantCount = allInvitedUsers.length
    const totalStake = individualStake * participantCount // For prize pool display only

    // 🏗️ Build challenge document
    const newChallengeData = {
      title: challengeData.title,
      description: challengeData.description || "",
      activityType: activityTypeId,
      type: activityDisplayName,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      endDate: Timestamp.fromDate(endDate),
      startDate: null,
      groupType: selectedGroupType.id,
      maxParticipants,
      participants: [user.uid],
      invitedUsers: allInvitedUsers,

      // 💰 Stakes
      individualStake: individualStake, // per player
      stakeXP: totalStake, // total pool

      // ⚙️ Challenge properties
      mode: "time",
      completionRequirement: "betterthanothers",
      goal: null,
      unit: activityConfig.unit || null,
      durationMinutes: Number(challengeData.durationMinutes) || 30,

      // 📊 Progress
      progress: {},
      status: { global: "pending" },
      completedBy: [],
    }

    // ✅ Save to Firestore
    const challengeRef = await addDoc(collection(db, "challenges"), newChallengeData)

    // ⚡ Deduct XP for all participants (creator + invited)
    const xpDeductionPromises = allInvitedUsers.map(async (uid) => {
      try {
        const userRef = doc(db, "users", uid)
        const userSnap = await getDoc(userRef)
        if (userSnap.exists()) {
          const userData = userSnap.data()
          const currentXP = Number(userData.xp) || 0
          const newXP = Math.max(currentXP - individualStake, 0)

          await updateDoc(userRef, { xp: newXP })
          console.log(`✅ Deducted ${individualStake} XP from ${uid}`)
        }
      } catch (err) {
        console.error(`❌ Failed to deduct XP for ${uid}:`, err)
      }
    })
    await Promise.allSettled(xpDeductionPromises)

    // 📣 Send notifications to invited friends
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

    // 🎉 Return challenge result
    return {
      success: true,
      message: `Challenge created and ${serializedFriendIds.length} friends invited!`,
      challenge: {
        id: challengeRef.id,
        ...newChallengeData,
        endDate, // Convert for frontend
      },
    }
  } catch (err) {
    console.error("Error creating challenge:", err)
    throw new Error(err.message || "Failed to create challenge. Please try again.")
  }
}

export const createCustomChallenge = async (customChallenge, targetFriend) => {
  try {
    if (!targetFriend) {
      throw new Error("No target friend selected for challenge.")
    }

    if (!customChallenge.title.trim()) {
      throw new Error("Please enter a challenge title.")
    }

    const user = auth.currentUser

    const activityConfig = ACTIVITY_TYPES.find((a) => a.id === customChallenge.activityType)
    if (!activityConfig) {
      throw new Error("Invalid activity type selected.")
    }

    const difficultyConfig = DIFFICULTY_LEVELS.find((d) => d.id === customChallenge.difficulty)
    if (!difficultyConfig) {
      throw new Error("Invalid difficulty level selected.")
    }

    const adjustedGoal = Math.round(customChallenge.goal * difficultyConfig.multiplier)

    const challengeData = {
      title: customChallenge.title,
      description: customChallenge.description,
      type: activityConfig.name,
      activityType: activityConfig.id,
      goal: adjustedGoal,
      originalGoal: customChallenge.goal,
      unit: activityConfig.unit,
      difficulty: difficultyConfig.id,
      difficultyMultiplier: difficultyConfig.multiplier,
      duration: customChallenge.duration,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      endDate: Timestamp.fromDate(new Date(Date.now() + customChallenge.duration * 24 * 60 * 60 * 1000)),
      isPublic: false,
      isCustomChallenge: true,
      groupType: "duo",
      maxParticipants: 2,
      participants: [user.uid],
      invitedUsers: [targetFriend.id],
      targetFriend: {
        id: targetFriend.id,
        name: targetFriend.displayName || targetFriend.username,
        avatar: targetFriend.avatar,
      },
      status: "pending",
      xpReward: 100,
    }

    console.log("🏆 Creating custom challenge:", challengeData)

    const challengeRef = await addDoc(collection(db, "challenges"), challengeData)

    const currentUserDoc = await getDoc(doc(db, "users", user.uid))
    const currentUserData = currentUserDoc.data()

    try {
      const notificationId = await NotificationService.sendChallengeInvitationNotification(
        targetFriend.id,
        {
          id: user.uid,
          username: currentUserData.username || currentUserData.displayName,
          displayName: currentUserData.displayName || currentUserData.username,
          avatar: currentUserData.avatar || DEFAULT_AVATAR,
        },
        {
          id: challengeRef.id,
          title: customChallenge.title,
          type: activityConfig.name,
          goal: adjustedGoal,
          unit: activityConfig.unit,
          difficulty: difficultyConfig.name,
          duration: customChallenge.duration,
          groupType: "Duo Challenge",
        },
      )

      if (notificationId) {
        console.log(`✅ Custom challenge notification sent: ${notificationId}`)
      } else {
        console.warn("⚠️ Failed to send custom challenge notification")
      }
    } catch (notificationError) {
      console.error("❌ Error sending custom challenge notification:", notificationError)
    }

    return {
      success: true,
      message: `Your ${activityConfig.name.toLowerCase()} challenge has been sent to ${targetFriend.displayName || targetFriend.username}!`,
      challenge: {
        id: challengeRef.id,
        ...challengeData,
        endDate: new Date(Date.now() + customChallenge.duration * 24 * 60 * 60 * 1000),
      },
    }
  } catch (err) {
    console.error("Error creating custom challenge:", err)
    throw new Error(err.message || "Failed to create challenge. Please try again.")
  }
}

export const joinChallenge = async (challengeId) => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("You must be signed in to join challenges.")

    const challengeRef = doc(db, "challenges", challengeId)

    // Use transaction to ensure atomic updates
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(challengeRef)
      if (!snap.exists()) throw new Error("Challenge not found.")

      const challengeData = snap.data()
      const participants = challengeData.participants || []

      if (participants.includes(user.uid)) {
        // Already joined
        return { participants, shouldStart: false, challengeData }
      }

      const newParticipants = [...participants, user.uid]

      // Update participants
      transaction.update(challengeRef, { participants: newParticipants })

      // Check if we should auto-start (duo challenge with 2 participants)
      const shouldStart =
        challengeData.groupType === "duo" && newParticipants.length === 2 && challengeData.status?.global === "pending"

      return { participants: newParticipants, shouldStart, challengeData }
    })

    // If we should auto-start, handle stakes and start challenge
    if (result.shouldStart) {
      const challengeData = result.challengeData
      const participants = result.participants
      const totalPrizePool = challengeData.stakeXP || 0
      const individualStake = totalPrizePool / participants.length // For duo: stakeXP / 2

      try {
        // Check if all participants have enough XP
        const participantChecks = await Promise.all(
          participants.map(async (participantId) => {
            const userDoc = await getDoc(doc(db, "users", participantId))
            const userData = userDoc.data()
            return {
              id: participantId,
              currentXP: userData?.xp || 0,
              hasEnoughXP: (userData?.xp || 0) >= individualStake,
            }
          }),
        )

        // Check if all participants have enough XP
        const allHaveEnoughXP = participantChecks.every((p) => p.hasEnoughXP)

        if (!allHaveEnoughXP) {
          // Cancel challenge and notify
          await updateDoc(challengeRef, {
            "status.global": "cancelled",
            cancelledReason: "Insufficient XP from participants",
            updatedAt: serverTimestamp(),
          })

          throw new Error("One or more participants don't have enough XP to stake.")
        }

        // Deduct stakes from all participants
        const stakeDeductions = participants.map((participantId) =>
          updateDoc(doc(db, "users", participantId), {
            xp: increment(-individualStake),
          }),
        )

        await Promise.all(stakeDeductions)

        // Start the challenge with prize pool confirmation
        await updateDoc(challengeRef, {
          "status.global": "active",
          startDate: serverTimestamp(),
          prizePool: totalPrizePool, // Confirm prize pool is set
          stakesDeducted: true, // Track that stakes have been deducted
          individualStake: individualStake, // Store for potential refunds
          updatedAt: serverTimestamp(),
        })

        console.log(`✅ Stakes deducted: ${individualStake} XP from each participant. Prize pool: ${totalPrizePool} XP`)
      } catch (stakeError) {
        console.error("❌ Error handling stakes:", stakeError)

        // If stake deduction fails, cancel the challenge
        await updateDoc(challengeRef, {
          "status.global": "cancelled",
          cancelledReason: stakeError.message,
          updatedAt: serverTimestamp(),
        })

        throw stakeError
      }
    }

    return {
      success: true,
      message: result.shouldStart
        ? "You joined and the duo challenge has started! Stakes have been deducted."
        : "Successfully joined the challenge!",
      updatedParticipants: result.participants,
      challengeStarted: result.shouldStart,
    }
  } catch (err) {
    console.error("Error joining challenge:", err)
    return {
      success: false,
      message: err.message || "Failed to join challenge. Please try again.",
      updatedParticipants: [],
      challengeStarted: false,
    }
  }
}

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

      if (isCompleted && !isExpired) {
        // ✅ Reward stake XP
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
        // ❌ Deduct stake XP
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

      // Save receipt
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

      // Normalize units before comparison
      const normalizedProgress = normalizeUnits(progress, challengeData.unit)
      const normalizedGoal = normalizeUnits(challengeData.goal, challengeData.unit)

      // Update progress
      transaction.update(challengeRef, {
        [`progress.${userId}`]: normalizedProgress,
        updatedAt: serverTimestamp(),
      })

      // Check completion requirement with up-to-date state
      const completionRequirement = challengeData.completionRequirement || "complete_goal"
      const endDate = challengeData.endDate?.toDate ? challengeData.endDate.toDate() : new Date(challengeData.endDate)
      const now = new Date()
      const isExpired = now > endDate

      // Only apply penalties at end of challenge, not during progress updates
      if (isExpired && completionRequirement === "better_than_others") {
        const participants = challengeData.participants || []
        const progressMap = challengeData.progress || {}

        // Find winner (highest progress)
        let winnerId = null
        let highestProgress = -1

        for (const participantId of participants) {
          const participantProgress = normalizeUnits(progressMap[participantId] || 0, challengeData.unit)
          if (participantProgress > highestProgress) {
            highestProgress = participantProgress
            winnerId = participantId
          }
        }

        // Apply penalties to losers only if challenge is expired
        if (winnerId && winnerId !== userId) {
          const userRef = doc(db, "users", userId)
          const userDoc = await transaction.get(userRef)

          if (userDoc.exists()) {
            const userData = userDoc.data()
            const xpPenalty = challengeData.xpPenalty || 10
            const newXP = Math.max(0, (userData.totalXP || 0) - xpPenalty)

            transaction.update(userRef, { totalXP: newXP })
            transaction.update(challengeRef, {
              [`status.${userId}`]: "failed",
              [`failedAt.${userId}`]: serverTimestamp(),
            })
          }
        }
      }

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
      return value / 1000 // Convert to kilometers
    case "kilometers":
    case "km":
      return value
    case "seconds":
    case "s":
      return value / 60 // Convert to minutes
    case "minutes":
    case "min":
      return value
    case "hours":
    case "h":
      return value * 60 // Convert to minutes
    default:
      return value // Return as-is for steps, reps, calories, etc.
  }
}

const checkChallengeCompletion = (challengeData, userId, normalizedProgress, normalizedGoal) => {
  const completionRequirement = challengeData.completionRequirement || "complete_goal"

  switch (completionRequirement) {
    case "complete_goal":
      return normalizedProgress >= normalizedGoal

    case "better_than_others":
      const participants = challengeData.participants || []
      const progressMap = challengeData.progress || {}

      // Check if user has highest progress among all participants
      for (const participantId of participants) {
        if (participantId !== userId) {
          const otherProgress = normalizeUnits(progressMap[participantId] || 0, challengeData.unit)
          if (otherProgress >= normalizedProgress) {
            return false
          }
        }
      }
      return normalizedProgress > 0 // Must have some progress to win

    case "time_based":
      const endDate = challengeData.endDate?.toDate ? challengeData.endDate.toDate() : new Date(challengeData.endDate)
      const now = new Date()
      return now <= endDate && normalizedProgress >= normalizedGoal

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
  const { setLeaderboard, setError } = callbacks

  try {
    const cachedLeaderboard = await getCachedData("leaderboard")
    if (cachedLeaderboard) {
      setLeaderboard(cachedLeaderboard)
    }

    const user = auth.currentUser
    if (!user) return

    const userDistances = {}
    const userExp = {}
    const userNames = {}
    const userAvatars = {}
    const userDocs = {}
    const userOnlineStatus = {}

    const usersRef = collection(db, "users")
    const usersQuery = query(usersRef, limit(50))
    const usersSnapshot = await getDocs(usersQuery)

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data()
      const userId = userDoc.id

      userNames[userId] = userData.displayName || userData.username || "User"
      userAvatars[userId] = userData.avatar || DEFAULT_AVATAR
      userDocs[userId] = userData
      userExp[userId] = userData.totalXP || userData.totalExp || userData.exp || 0
      userOnlineStatus[userId] = userData.isOnline || false
      userDistances[userId] = userData.totalDistance || 0
    }

    const activitiesRef = collection(db, "activities")
    const activitiesQuery = query(activitiesRef, limit(100))
    const activitiesSnapshot = await getDocs(activitiesQuery)

    for (const activityDoc of activitiesSnapshot.docs) {
      const activityData = activityDoc.data()
      const userId = activityData.userId
      if (!userId) continue

      if (!userDistances[userId]) {
        userDistances[userId] = 0
      }

      const distanceInMeters =
        typeof activityData.distance === "number" && !isNaN(activityData.distance) ? activityData.distance : 0
      userDistances[userId] += distanceInMeters / 1000
    }

    const allUserIds = Object.keys(userNames)
    const leaderboardData = allUserIds.map((userId) => ({
      id: userId,
      name: userNames[userId] || "User",
      avatar: userAvatars[userId] || DEFAULT_AVATAR,
      distance: userDistances[userId] || 0,
      exp: userExp[userId] || 0,
      isCurrentUser: userId === user.uid,
      isOnline: userOnlineStatus[userId] || false,
      level: userDocs[userId]?.level || 1,
      totalActivities: userDocs[userId]?.totalActivities || 0,
    }))

    leaderboardData.sort((a, b) => {
      if (b.exp !== a.exp) {
        return b.exp - a.exp
      }
      return b.distance - a.distance
    })

    const topLeaderboard = leaderboardData.slice(0, 15) // Show top 15 users

    setLeaderboard(topLeaderboard)
    await setCachedData("leaderboard", topLeaderboard)
  } catch (err) {
    console.warn("Error creating leaderboard:", err)
    setError(`Error loading leaderboard: ${err.message}`)
  }
}

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

// Chat Management
export const setupChatRoom = async (friendId) => {
  try {
    const user = auth.currentUser
    if (!user) {
      throw new Error("User not authenticated")
    }

    const chatRoomId = [user.uid, friendId].sort().join("_")

    const cachedMessages = await getCachedData(`chatMessages_${chatRoomId}`)
    let initialMessages = []
    if (cachedMessages) {
      initialMessages = cachedMessages
    }

    const chatRoomRef = doc(db, `chatRooms/${chatRoomId}`)
    const chatRoomDoc = await getDoc(chatRoomRef)

    if (!chatRoomDoc.exists()) {
      try {
        await setDoc(chatRoomRef, {
          participants: [user.uid, friendId],
          createdAt: serverTimestamp(),
          lastMessage: null,
          lastMessageTime: null,
        })
        await new Promise((resolve) => setTimeout(resolve, 500))
        console.log("Chat room created successfully")
      } catch (createErr) {
        console.error("Error creating chat room:", createErr)
        throw new Error("Failed to create chat room: " + createErr.message)
      }
    }

    try {
      const messagesRef = collection(db, `chatRooms/${chatRoomId}/messages`)
      const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(20))
      const messagesSnapshot = await getDocs(messagesQuery)

      const messages = messagesSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date(),
        }))
        .reverse()

      await setCachedData(`chatMessages_${chatRoomId}`, messages)

      return {
        success: true,
        chatRoomId,
        messages,
        initialMessages,
      }
    } catch (messagesErr) {
      console.error("Error fetching chat messages:", messagesErr)
      throw new Error("Failed to load messages: " + messagesErr.message)
    }
  } catch (err) {
    console.error("Error setting up chat room:", err)
    let errorMessage = "Failed to open chat. Please try again."

    if (err.code === "permission-denied") {
      errorMessage = "You don't have permission to access this chat. This may be due to security rules."
    }

    throw new Error(errorMessage)
  }
}

export const sendChatMessage = async (chatRoomId, messageText, selectedFriend, userProfile) => {
  try {
    if (!messageText.trim() || !selectedFriend) {
      throw new Error("Message text and friend are required")
    }

    const user = auth.currentUser

    // Send message to Firestore
    const batch = writeBatch(db)
    const messagesRef = collection(db, `chatRooms/${chatRoomId}/messages`)
    const newMessageRef = doc(messagesRef)

    const newMessage = {
      text: messageText.trim(),
      senderId: user.uid,
      senderName: userProfile?.username || user.displayName || "You",
      timestamp: serverTimestamp(),
    }

    batch.set(newMessageRef, newMessage)

    // Update chat room with last message
    const chatRoomRef = doc(db, "chatRooms", chatRoomId)
    batch.update(chatRoomRef, {
      lastMessage: messageText.trim(),
      lastMessageTime: serverTimestamp(),
    })

    await batch.commit()

    // Send notification to the recipient using the real NotificationService
    try {
      const notificationId = await NotificationService.sendChatMessageNotification(
        selectedFriend.id,
        {
          id: user.uid,
          username: userProfile?.username || userProfile?.displayName,
          displayName: userProfile?.displayName || userProfile?.username,
          avatar: userProfile?.avatar || DEFAULT_AVATAR,
        },
        messageText.trim(),
        chatRoomId,
      )

      if (notificationId) {
        console.log(`✅ Chat message notification sent: ${notificationId}`)
      } else {
        console.warn("⚠️ Failed to send chat message notification")
      }
    } catch (notificationError) {
      console.error("❌ Error sending chat message notification:", notificationError)
      // Don't fail the entire operation if notification fails
    }

    return {
      success: true,
      messageId: newMessageRef.id,
      message: newMessage,
    }
  } catch (err) {
    console.error("Error sending message:", err)
    throw new Error("Failed to send message. Please try again.")
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

export const startChallenge = async (challengeId) => {
  const user = auth.currentUser
  if (!user) throw new Error("You must be signed in.")

  const challengeRef = doc(db, "challenges", challengeId)

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(challengeRef)
    if (!snap.exists()) throw new Error("Challenge not found.")

    const challenge = snap.data()
    const count = (challenge.participants || []).length

    // 🔒 Ensure only creator can start
    if (challenge.createdBy !== user.uid) {
      throw new Error("Only the challenge creator can start this challenge.")
    }

    // 🔒 Ensure still pending
    if (challenge.status?.global !== "pending") {
      throw new Error("Challenge has already started or ended.")
    }

    // Validate participant count
    if (challenge.groupType === "duo" && count !== 2) {
      throw new Error("Both players must join before starting.")
    }
    if (challenge.groupType === "lobby" && count < 2) {
      throw new Error("At least 2 players must join before starting.")
    }

    transaction.update(challengeRef, {
      startDate: serverTimestamp(),
      "status.global": "active",
    })
  })
}

// CommunityBackend.js
export const stakeForChallenge = async (challengeId) => {
  const user = auth.currentUser
  if (!user) throw new Error("Not signed in")

  const challengeRef = doc(db, "challenges", challengeId)
  const userRef = doc(db, "users", user.uid)

  return await runTransaction(db, async (t) => {
    const chSnap = await t.get(challengeRef)
    const userSnap = await t.get(userRef)

    if (!chSnap.exists()) throw new Error("Challenge not found")
    if (!userSnap.exists()) throw new Error("User not found")

    const ch = chSnap.data()
    const individualStake = Number(ch.individualStake) || Number(ch.stakeXP) / (ch.participants?.length || 1)

    const currentXP = Number(userSnap.data()?.xp ?? userSnap.data()?.totalXP ?? 0)
    if (currentXP < individualStake) throw new Error("Insufficient XP to stake")

    // deduct user's xp (only their own doc -> allowed)
    t.update(userRef, { xp: currentXP - individualStake })

    // record that this user staked in the challenge (only the user's key in status -> allowed by your rules)
    t.update(challengeRef, {
      [`status.${user.uid}`]: "staked",
      [`stakedAt.${user.uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true, individualStake }
  })
}

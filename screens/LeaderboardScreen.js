"use client"

import { useState, useEffect, useRef } from "react"
import { View, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image, Animated, Easing } from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import { db, auth } from "../firebaseConfig"
import { collection, query, getDocs, doc, updateDoc } from "firebase/firestore" // Added updateDoc, doc
import { onAuthStateChanged } from "firebase/auth"
import * as Location from "expo-location" // Import Location

// Define the collections that hold trackable user activities
const ACTIVITY_COLLECTIONS = [
  "normal_activities",
  "quest_activities",
  "challenge_activities",
]

const LeaderboardScreen = ({ navigateToDashboard }) => {
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortMetric, setSortMetric] = useState("challengeWins")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // --- NEW STATE FOR LOCATION ---
  const [filterMode, setFilterMode] = useState("global") // "global" | "city"
  const [userLocation, setUserLocation] = useState(null) // { city: "Naga City", country: "Philippines" }
  const [locationPermission, setLocationPermission] = useState(false)

  // Animation ref - EXACTLY LIKE DASHBOARD
  const patternAnim = useRef(new Animated.Value(0)).current

  const metrics = [
    {
      id: "totalDistance",
      label: "Distance",
      icon: "map-outline",
      color: "#4361EE",
      bgColor: "#4361EE20",
      unit: "km",
    },
    {
      id: "totalActivities",
      label: "Activities",
      icon: "fitness-outline",
      color: "#06D6A0",
      bgColor: "#06D6A020",
      unit: "",
    },
    {
      id: "challengeWins",
      label: "Challenge Wins",
      icon: "trophy-outline",
      color: "#FFC107",
      bgColor: "#FFC10720",
      unit: "",
    },
  ]

  // Animate pattern on mount
  useEffect(() => {
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

  // --- 1. INITIALIZE LOCATION ---
  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setLocationPermission(false)
          return
        }
        setLocationPermission(true)

        // Get coordinates
        const location = await Location.getCurrentPositionAsync({})
        // Reverse Geocode to get City/Region
        const address = await Location.reverseGeocodeAsync(location.coords)

        if (address.length > 0) {
          const { city, region, country, isoCountryCode } = address[0]
          const locationData = {
            city: city || region, // Fallback to region if city is null
            country,
            isoCountryCode
          }
          setUserLocation(locationData)

          // Update Firestore User Profile so others can see me in Local Leaderboard
          if (auth.currentUser) {
            const userRef = doc(db, "users", auth.currentUser.uid)
            // We update silently without blocking UI
            updateDoc(userRef, { location: locationData }).catch(e => console.log("Loc update failed", e))
          }
        }
      } catch (err) {
        console.log("Error getting location for leaderboard:", err)
      }
    }

    if (isAuthenticated) {
      initializeLocation()
    }
  }, [isAuthenticated])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user)
      if (!user) {
        Alert.alert("Authentication Required", "Please sign in to view the leaderboard.", [
          { text: "OK", onPress: navigateToDashboard },
        ])
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [navigateToDashboard])

  const fetchData = async (isRefresh = false) => {
    if (!isAuthenticated) return
    try {
      if (!isRefresh) setLoading(true)
      else setRefreshing(true)

      // Fetch user data INCLUDING LOCATION
      const usersQuery = query(collection(db, "users"))
      const usersSnapshot = await getDocs(usersQuery)
      const users = usersSnapshot.docs.map((doc) => ({
        uid: doc.id,
        username: doc.data().displayName || doc.data().username || "User",
        avatar: doc.data().avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
        location: doc.data().location || null, // Fetch stored location
      }))

      // Initialize user stats
      const userStats = {}
      users.forEach(user => {
        userStats[user.uid] = {
          totalDistance: 0,
          totalActivities: 0,
          longestRun: 0,
          challengeWins: 0,
        }
      })

      // Fetch activities (Existing logic...)
      const fetchActivitiesPromises = ACTIVITY_COLLECTIONS.map(collectionName =>
        getDocs(query(collection(db, collectionName)))
      )
      const allActivitiesSnapshots = await Promise.all(fetchActivitiesPromises)

      allActivitiesSnapshots.forEach(activitiesSnapshot => {
        activitiesSnapshot.forEach((doc) => {
          const activity = doc.data()
          const userId = activity.userId
          if (userStats[userId]) {
            const distanceInMeters = (activity.distance || 0)
            const distanceInKm = distanceInMeters / 1000
            const validDistance = activity.activityType === 'pushup' ? 0 : distanceInKm
            userStats[userId].totalDistance += validDistance
            userStats[userId].totalActivities += 1
            userStats[userId].longestRun = Math.max(userStats[userId].longestRun, validDistance)
          }
        })
      })

      // Fetch challenge wins
      const challengesQuery = query(collection(db, "challenges"))
      const challengesSnapshot = await getDocs(challengesQuery)
      challengesSnapshot.forEach((doc) => {
        const challenge = doc.data()
        const winnerId = challenge.winnerId
        if (winnerId && userStats[winnerId]) {
          userStats[winnerId].challengeWins += 1
        }
      })

      // Combine
      let leaderboard = users
        .map((user) => ({
          uid: user.uid,
          username: user.username,
          avatar: user.avatar,
          location: user.location, // Include location in final object
          ...userStats[user.uid],
        }))
        .filter((user) => user.totalActivities > 0)

      // --- 2. APPLY LOCATION FILTER ---
      if (filterMode === 'city' && userLocation?.city) {
        leaderboard = leaderboard.filter(user =>
          user.location?.city === userLocation.city
        )
      }

      // Sort
      leaderboard.sort((a, b) => b[sortMetric] - a[sortMetric])

      setLeaderboardData(leaderboard)
    } catch (err) {
      console.error("Error fetching leaderboard data:", err)
      Alert.alert("Error", "Failed to load leaderboard. Check console for details.", [
        { text: "OK", onPress: navigateToDashboard },
      ])
    } finally {
      if (!isRefresh) setLoading(false)
      else setRefreshing(false)
    }
  }

  // Re-fetch when filter mode changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
    }
  }, [isAuthenticated, sortMetric, navigateToDashboard, filterMode, userLocation]) // Added filterMode, userLocation

  const handleMetricChange = (metric) => {
    setSortMetric(metric)
  }

  const handleRefresh = () => {
    fetchData(true)
  }

  const getRankingColor = (index) => {
    switch (index) {
      case 0: return "#FFD700"
      case 1: return "#C0C0C0"
      case 2: return "#CD7F32"
      default: return "#6B7280"
    }
  }

  const formatValue = (value, metricId) => {
    const metric = metrics.find(m => m.id === metricId)
    if (metricId === "totalDistance" || metricId === "longestRun") {
      return `${(Number(value) || 0).toFixed(1)} km`
    }
    return `${Math.round(value) || 0}${metric?.unit || ''}`
  }

  // --- UI COMPONENT: LOCATION TOGGLE ---
  const renderLocationToggle = () => (
    <View style={twrnc`px-5 pb-2`}>
      <View style={twrnc`flex-row bg-[#1e293b] p-1 rounded-xl border border-[#334155]`}>
        {/* Global Tab */}
        <TouchableOpacity
          onPress={() => setFilterMode("global")}
          style={[
            twrnc`flex-1 py-2 rounded-lg items-center justify-center flex-row`,
            filterMode === "global" ? twrnc`bg-[#4361EE]` : twrnc`bg-transparent`
          ]}
        >
          <Ionicons name="earth" size={16} color="white" style={twrnc`mr-2`} />
          <CustomText weight="bold" style={twrnc`text-white text-xs`}>Global</CustomText>
        </TouchableOpacity>

        {/* Local Tab */}
        <TouchableOpacity
          onPress={() => {
            if (!userLocation) {
              Alert.alert("Location Required", "We need your location to show local rankings.")
              return
            }
            setFilterMode("city")
          }}
          style={[
            twrnc`flex-1 py-2 rounded-lg items-center justify-center flex-row`,
            filterMode === "city" ? twrnc`bg-[#4361EE]` : twrnc`bg-transparent`
          ]}
        >
          <Ionicons name="location" size={16} color="white" style={twrnc`mr-2`} />
          <View>
            <CustomText weight="bold" style={twrnc`text-white text-xs`}>
              {userLocation ? userLocation.city : "Local"}
            </CustomText>
          </View>
        </TouchableOpacity>
      </View>

      {/* Location Status Text */}
      {filterMode === "city" && userLocation && (
        <CustomText style={twrnc`text-[#94a3b8] text-[10px] text-center mt-2`}>
          Showing competitors in {userLocation.city}, {userLocation.country}
        </CustomText>
      )}
    </View>
  )

  const renderLeaderboardItem = ({ item, index }) => (
    <View style={twrnc`mb-3 mx-5`}>
      <View style={twrnc`bg-[#1e293b] rounded-2xl overflow-hidden border border-[#334155]`}>
        <View style={twrnc`p-4`}>
          <View style={twrnc`flex-row items-center`}>
            {/* Ranking Badge */}
            <View
              style={[
                twrnc`w-10 h-10 rounded-full items-center justify-center mr-3`,
                { backgroundColor: getRankingColor(index) + "30" },
              ]}
            >
              <CustomText style={[twrnc`text-sm font-bold`, { color: getRankingColor(index) }]}>
                #{index + 1}
              </CustomText>
            </View>

            {/* User Avatar */}
            <View style={twrnc`relative mr-3`}>
              <Image
                source={{ uri: item.avatar }}
                style={twrnc`w-14 h-14 rounded-full border-2 border-[#334155]`}
              />
              {index < 3 && (
                <View
                  style={[
                    twrnc`absolute -top-1 -right-1 w-6 h-6 rounded-full items-center justify-center`,
                    { backgroundColor: getRankingColor(index) },
                  ]}
                >
                  <Ionicons name="trophy" size={12} color="#0f172a" />
                </View>
              )}
            </View>

            {/* User Info */}
            <View style={twrnc`flex-1`}>
              <CustomText style={twrnc`text-white text-base font-semibold`}>
                {item.username}
              </CustomText>

              {/* Added Location display under name */}
              <View style={twrnc`flex-row items-center mt-0.5`}>
                {item.location?.city && (
                  <View style={twrnc`flex-row items-center mr-2`}>
                    <Ionicons name="location-sharp" size={10} color="#64748b" style={twrnc`mr-0.5`} />
                    <CustomText style={twrnc`text-[#94a3b8] text-xs`}>
                      {item.location.city}
                    </CustomText>
                  </View>
                )}
                <CustomText style={twrnc`text-[#94a3b8] text-xs`}>
                  • {item.totalActivities} activities
                </CustomText>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={twrnc`mt-4 flex-row justify-between`}>
            {/* ... existing stats grid code ... */}
            <View style={twrnc`items-center flex-1`}>
              <CustomText style={twrnc`text-[#4361EE] text-lg font-bold`}>
                {formatValue(item.totalDistance, "totalDistance")}
              </CustomText>
              <CustomText style={twrnc`text-[#64748b] text-xs mt-1`}>Distance</CustomText>
            </View>
            <View style={twrnc`items-center flex-1`}>
              <CustomText style={twrnc`text-[#06D6A0] text-lg font-bold`}>
                {formatValue(item.totalActivities, "totalActivities")}
              </CustomText>
              <CustomText style={twrnc`text-[#64748b] text-xs mt-1`}>Activities</CustomText>
            </View>
            <View style={twrnc`items-center flex-1`}>
              <CustomText style={twrnc`text-[#FFC107] text-lg font-bold`}>
                {formatValue(item.challengeWins, "challengeWins")}
              </CustomText>
              <CustomText style={twrnc`text-[#64748b] text-xs mt-1`}>Wins</CustomText>
            </View>
          </View>

          {/* Highlight current sorting metric */}
          {sortMetric && (
            <View
              style={[
                twrnc`mt-4 p-3 rounded-xl flex-row items-center`,
                { backgroundColor: metrics.find((m) => m.id === sortMetric)?.bgColor },
              ]}
            >
              <Ionicons
                name={metrics.find((m) => m.id === sortMetric)?.icon}
                size={16}
                color={metrics.find((m) => m.id === sortMetric)?.color}
                style={twrnc`mr-2`}
              />
              <CustomText
                style={[
                  twrnc`text-sm font-semibold`,
                  { color: metrics.find((m) => m.id === sortMetric)?.color },
                ]}
              >
                {formatValue(item[sortMetric], metrics.find((m) => m.id === sortMetric)?.id)}
              </CustomText>
            </View>
          )}

        </View>
      </View>
    </View>
  )

  const renderMetricButton = (metric) => (
    <TouchableOpacity
      key={metric.id}
      onPress={() => handleMetricChange(metric.id)}
      activeOpacity={0.7}
      style={[
        twrnc`flex-1 py-3.5 rounded-xl items-center justify-center`,
        sortMetric === metric.id
          ? { backgroundColor: metric.color }
          : twrnc`bg-[#1e293b] border border-[#334155]`,
      ]}
    >
      <Ionicons
        name={metric.icon}
        size={22}
        color={sortMetric === metric.id ? "#fff" : "#64748b"}
        style={twrnc`mb-1`}
      />
      <CustomText
        style={[
          twrnc`text-xs font-semibold`,
          { color: sortMetric === metric.id ? "#fff" : "#94a3b8" },
        ]}
      >
        {metric.label}
      </CustomText>
    </TouchableOpacity>
  )

  // ... Authentication and Loading checks remain the same ...

  if (!isAuthenticated) return <View style={twrnc`flex-1 bg-[#0f172a]`} />
  if (loading) return (
    <View style={twrnc`flex-1 bg-[#0f172a] items-center justify-center`}>
      <ActivityIndicator size="large" color="#4361EE" />
    </View>
  )

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      {/* ===== HEADER WITH ANIMATED PATTERN ===== */}
      <View style={twrnc`relative bg-gradient-to-b from-[#1e293b] to-[#0f172a] overflow-hidden`}>
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

        <View style={twrnc`pt-12 pb-4 px-5 relative z-10`}>
          <TouchableOpacity
            onPress={navigateToDashboard}
            style={twrnc`mb-4 flex-row items-center`}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={twrnc`flex-row items-center justify-between mb-2`}>
            <View style={twrnc`flex-1`}>
              <CustomText style={twrnc`text-white text-3xl font-bold`}>
                Leaderboard
              </CustomText>
              <CustomText style={twrnc`text-[#94a3b8] text-sm mt-1`}>
                {leaderboardData.length} competitors {filterMode === 'city' ? 'nearby' : 'globally'}
              </CustomText>
            </View>

            <TouchableOpacity
              onPress={handleRefresh}
              style={twrnc`bg-[#1e293b] p-3 rounded-xl border border-[#334155]`}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#4361EE" />
              ) : (
                <Ionicons name="refresh" size={20} color="#4361EE" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ===== NEW: LOCATION TOGGLE ===== */}
      {renderLocationToggle()}

      {/* ===== METRIC SELECTOR ===== */}
      <View style={twrnc`px-5 py-4`}>
        <View style={twrnc`flex-row gap-3`}>
          {metrics.map((metric) => renderMetricButton(metric))}
        </View>
      </View>

      {/* ===== LEADERBOARD LIST ===== */}
      {leaderboardData.length > 0 ? (
        <FlatList
          data={leaderboardData}
          keyExtractor={(item, index) => `${item.uid}-${index}`}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={twrnc`pb-4`}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={twrnc`flex-1 items-center justify-center p-6`}>
          <Ionicons name="location-outline" size={64} color="#64748b" style={twrnc`mb-4`} />
          <CustomText style={twrnc`text-white text-xl font-bold mb-2 text-center`}>
            No Competitors Here
          </CustomText>
          <CustomText style={twrnc`text-[#94a3b8] text-center mb-6`}>
            {filterMode === 'city'
              ? `You're the first one in ${userLocation?.city || 'this area'}! Be the local champion.`
              : "Start tracking to join the global leaderboard."}
          </CustomText>
          <TouchableOpacity
            onPress={navigateToDashboard}
            style={twrnc`bg-[#4361EE] px-6 py-3 rounded-xl`}
          >
            <CustomText style={twrnc`text-white font-semibold`}>
              Start Activity
            </CustomText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

export default LeaderboardScreen
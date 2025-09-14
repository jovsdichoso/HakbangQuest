"use client"

import { useState, useEffect } from "react"
import { View, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image } from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import { db, auth } from "../firebaseConfig"
import { collection, query, getDocs } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

const LeaderboardScreen = ({ navigateToDashboard }) => {
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortMetric, setSortMetric] = useState("totalDistance")
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Enhanced metrics with better icons and colors
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
      id: "longestRun",
      label: "Longest Run",
      icon: "trophy-outline",
      color: "#FFC107",
      bgColor: "#FFC10720",
      unit: "km",
    },
  ]

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

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchLeaderboardData = async () => {
      try {
        setLoading(true)
        // Fetch users (only uid and username)
        const usersQuery = query(collection(db, "users"))
        const usersSnapshot = await getDocs(usersQuery)
        const users = usersSnapshot.docs.map((doc) => ({
          uid: doc.id,
          username: doc.data().username || "User",
          avatar: doc.data().avatar || "https://randomuser.me/api/portraits/men/1.jpg",
        }))

        // Fetch activities
        const activitiesQuery = query(collection(db, "activities"))
        const activitiesSnapshot = await getDocs(activitiesQuery)
        const userStats = {}

        activitiesSnapshot.forEach((doc) => {
          const activity = doc.data()
          const userId = activity.userId

          if (!userStats[userId]) {
            userStats[userId] = {
              totalDistance: 0,
              totalActivities: 0,
              longestRun: 0,
            }
          }

          userStats[userId].totalDistance += activity.distance || 0
          userStats[userId].totalActivities += 1
          userStats[userId].longestRun = Math.max(userStats[userId].longestRun, activity.distance || 0)
        })

        // Combine user data with stats
        const leaderboard = users
          .map((user) => ({
            username: user.username,
            avatar: user.avatar,
            ...userStats[user.uid],
            totalDistance: userStats[user.uid]?.totalDistance || 0,
            totalActivities: userStats[user.uid]?.totalActivities || 0,
            longestRun: userStats[user.uid]?.longestRun || 0,
          }))
          .filter((user) => user.totalActivities > 0)
          .sort((a, b) => b[sortMetric] - a[sortMetric])

        setLeaderboardData(leaderboard)
      } catch (err) {
        console.error("Error fetching leaderboard data:", err)
        if (err.code === "permission-denied") {
          Alert.alert(
            "Permission Denied",
            "Unable to load leaderboard due to insufficient permissions. Please try again or sign in.",
            [
              { text: "Retry", onPress: () => fetchLeaderboardData() },
              { text: "Back", onPress: navigateToDashboard },
            ],
          )
        } else {
          Alert.alert("Error", "Failed to load leaderboard. Please try again later.", [
            { text: "OK", onPress: navigateToDashboard },
          ])
        }
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboardData()
  }, [isAuthenticated, sortMetric, navigateToDashboard])

  const handleMetricChange = (metric) => {
    setSortMetric(metric)
  }

  const getRankingColor = (index) => {
    switch (index) {
      case 0:
        return "#FFD700" // Gold
      case 1:
        return "#C0C0C0" // Silver
      case 2:
        return "#CD7F32" // Bronze
      default:
        return "#6B7280" // Gray
    }
  }

  const getRankingIcon = (index) => {
    if (index < 3) return "trophy"
    return "medal-outline"
  }

  const formatValue = (value, unit) => {
    if (unit === "km") {
      return `${(Number(value) || 0).toFixed(1)} ${unit}`
    }
    return `${value || 0}${unit}`
  }

  const renderLeaderboardItem = ({ item, index }) => (
    <View style={twrnc`mx-5 mb-4`}>
      <View
        style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 ${index < 3 ? "border-2" : "border"} ${
          index === 0
            ? "border-[#FFD700]"
            : index === 1
              ? "border-[#C0C0C0]"
              : index === 2
                ? "border-[#CD7F32]"
                : "border-[#3A3F4B]"
        } shadow-lg`}
      >
        <View style={twrnc`flex-row items-center`}>
          {/* Ranking Badge */}
          <View style={twrnc`items-center mr-4`}>
            <View
              style={[
                twrnc`w-12 h-12 rounded-2xl items-center justify-center mb-2`,
                { backgroundColor: `${getRankingColor(index)}20` },
              ]}
            >
              <Ionicons name={getRankingIcon(index)} size={24} color={getRankingColor(index)} />
            </View>
            <CustomText weight="bold" style={[twrnc`text-lg`, { color: getRankingColor(index) }]}>
              #{index + 1}
            </CustomText>
          </View>

          {/* User Info */}
          <View style={twrnc`flex-1`}>
            <View style={twrnc`flex-row items-center mb-3`}>
              <View style={twrnc`relative mr-3`}>
                <Image
                  source={{ uri: item.avatar }}
                  style={twrnc`w-12 h-12 rounded-2xl border-2 border-[#4361EE]`}
                  defaultSource={{ uri: "https://randomuser.me/api/portraits/men/1.jpg" }}
                />
                {/* Ranking badge overlay for top 3 */}
                {index < 3 && (
                  <View
                    style={[
                      twrnc`absolute -top-1 -right-1 w-6 h-6 rounded-full items-center justify-center border-2 border-[#2A2E3A]`,
                      { backgroundColor: getRankingColor(index) },
                    ]}
                  >
                    <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                      {index + 1}
                    </CustomText>
                  </View>
                )}
              </View>
              <View style={twrnc`flex-1`}>
                <CustomText weight="bold" style={twrnc`text-white text-lg mb-1`}>
                  {item.username}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-sm`}>
                  {item.totalActivities} activities completed
                </CustomText>
              </View>
            </View>

            {/* Stats Grid */}
            <View style={twrnc`flex-row justify-between`}>
              <View style={twrnc`items-center flex-1`}>
                <View style={twrnc`w-10 h-10 rounded-xl bg-[#4361EE20] items-center justify-center mb-2`}>
                  <Ionicons name="map-outline" size={16} color="#4361EE" />
                </View>
                <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                  {(Number(item.totalDistance) || 0).toFixed(1)} km
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs`}>Distance</CustomText>
              </View>

              <View style={twrnc`items-center flex-1`}>
                <View style={twrnc`w-10 h-10 rounded-xl bg-[#06D6A020] items-center justify-center mb-2`}>
                  <Ionicons name="fitness-outline" size={16} color="#06D6A0" />
                </View>
                <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                  {item.totalActivities}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs`}>Activities</CustomText>
              </View>

              <View style={twrnc`items-center flex-1`}>
                <View style={twrnc`w-10 h-10 rounded-xl bg-[#FFC10720] items-center justify-center mb-2`}>
                  <Ionicons name="trophy-outline" size={16} color="#FFC107" />
                </View>
                <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                  {(Number(item.longestRun) || 0).toFixed(1)} km
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs`}>Longest</CustomText>
              </View>
            </View>
          </View>
        </View>

        {/* Highlight current sorting metric */}
        <View style={twrnc`mt-4 pt-4 border-t border-[#3A3F4B]`}>
          <View style={twrnc`flex-row items-center justify-center`}>
            <View
              style={[
                twrnc`px-4 py-2 rounded-xl flex-row items-center`,
                { backgroundColor: metrics.find((m) => m.id === sortMetric)?.bgColor },
              ]}
            >
              <Ionicons
                name={metrics.find((m) => m.id === sortMetric)?.icon}
                size={16}
                color={metrics.find((m) => m.id === sortMetric)?.color}
                style={twrnc`mr-2`}
              />
              <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                {formatValue(item[sortMetric], metrics.find((m) => m.id === sortMetric)?.unit)}
              </CustomText>
            </View>
          </View>
        </View>
      </View>
    </View>
  )

  const renderMetricButton = (metric) => (
    <TouchableOpacity
      key={metric.id}
      style={twrnc`flex-1 mx-1`}
      onPress={() => handleMetricChange(metric.id)}
      activeOpacity={0.7}
    >
      <View
        style={[
          twrnc`p-4 rounded-2xl items-center ${sortMetric === metric.id ? "border-2" : "border"}`,
          {
            backgroundColor: sortMetric === metric.id ? metric.bgColor : "#2A2E3A",
            borderColor: sortMetric === metric.id ? metric.color : "#3A3F4B",
          },
        ]}
      >
        <View
          style={[twrnc`w-12 h-12 rounded-2xl items-center justify-center mb-3`, { backgroundColor: metric.bgColor }]}
        >
          <Ionicons name={metric.icon} size={24} color={metric.color} />
        </View>
        <CustomText weight={sortMetric === metric.id ? "bold" : "medium"} style={twrnc`text-white text-sm text-center`}>
          {metric.label}
        </CustomText>
        {sortMetric === metric.id && (
          <View style={twrnc`mt-2`}>
            <Ionicons name="checkmark-circle" size={16} color={metric.color} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )

  if (!isAuthenticated) {
    return (
      <View style={twrnc`flex-1 bg-[#121826]`}>
        <View style={twrnc`flex-1 justify-center items-center px-5`}>
          <View style={twrnc`w-24 h-24 rounded-3xl bg-[#FFC10720] items-center justify-center mb-6`}>
            <Ionicons name="lock-closed-outline" size={48} color="#FFC107" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-2xl mb-4 text-center`}>
            Authentication Required
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-center mb-8 leading-6`}>
            Please sign in to view the leaderboard and compete with other users.
          </CustomText>
          <TouchableOpacity
            style={twrnc`bg-[#4361EE] px-8 py-4 rounded-2xl`}
            onPress={navigateToDashboard}
            activeOpacity={0.8}
          >
            <CustomText weight="semibold" style={twrnc`text-white text-base`}>
              Back to Dashboard
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
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
            Loading Leaderboard
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-center`}>Fetching the latest rankings...</CustomText>
        </View>
      </View>
    )
  }

  return (
    <View style={twrnc`flex-1 bg-[#121826]`}>

      {/* Enhanced Header */}
      <View style={twrnc`bg-[#1A1F2E] px-4 py-4 flex-row items-center justify-between shadow-lg`}>
        <TouchableOpacity onPress={navigateToDashboard} style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={twrnc`items-center`}>
          <CustomText weight="bold" style={twrnc`text-white text-xl`}>
            Leaderboard
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm`}>{leaderboardData.length} competitors</CustomText>
        </View>

        <TouchableOpacity style={twrnc`p-2 rounded-xl bg-[#2A2E3A]`} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Enhanced Metric Selector */}
      <View style={twrnc`px-5 py-6`}>
        <CustomText weight="bold" style={twrnc`text-white text-lg mb-4`}>
          Sort by Metric
        </CustomText>
        <View style={twrnc`flex-row`}>{metrics.map((metric) => renderMetricButton(metric))}</View>
      </View>

      {/* Leaderboard List */}
      {leaderboardData.length > 0 ? (
        <FlatList
          data={leaderboardData}
          keyExtractor={(item, index) => `${item.username}-${index}`}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={twrnc`pb-20`}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={twrnc`flex-1 justify-center items-center px-5`}>
          <View style={twrnc`w-24 h-24 rounded-3xl bg-[#FFC10720] items-center justify-center mb-6`}>
            <Ionicons name="trophy-outline" size={48} color="#FFC107" />
          </View>
          <CustomText weight="bold" style={twrnc`text-white text-2xl mb-4 text-center`}>
            No Activities Yet
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-center mb-8 leading-6`}>
            Start tracking your activities to join the leaderboard and compete with other users!
          </CustomText>
          <TouchableOpacity
            style={twrnc`bg-[#06D6A0] px-8 py-4 rounded-2xl`}
            onPress={navigateToDashboard}
            activeOpacity={0.8}
          >
            <CustomText weight="semibold" style={twrnc`text-white text-base`}>
              Start Your First Activity
            </CustomText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

export default LeaderboardScreen

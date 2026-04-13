// FileName: LeaderboardScreen.js
"use client"

import { useState, useEffect, useRef } from "react"
import { View, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image, Animated, Easing } from "react-native"
import twrnc from "twrnc"
import CustomText from "../components/CustomText"
import { Ionicons } from "@expo/vector-icons"
import { db, auth } from "../firebaseConfig"
import { collection, query, getDocs, doc, updateDoc, orderBy, limit, startAfter, where } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import * as Location from "expo-location"

const PAGE_SIZE = 10;

const LeaderboardScreen = ({ navigateToDashboard }) => {
  const [leaderboardData, setLeaderboardData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastVisible, setLastVisible] = useState(null)
  const [hasMore, setHasMore] = useState(true)

  // Mapping UI sort keys to Firestore field keys
  // Note: XPManager updates 'completedChallenges', so we use that for wins/completions
  const [sortMetric, setSortMetric] = useState("totalDistance") // Firestore field: totalDistance
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Location State
  const [filterMode, setFilterMode] = useState("global") // "global" | "city"
  const [userLocation, setUserLocation] = useState(null)
  const [locationPermission, setLocationPermission] = useState(false)

  const patternAnim = useRef(new Animated.Value(0)).current

  const metrics = [
    {
      id: "totalDistance", // Matches Firestore field on user doc
      label: "Distance",
      icon: "map-outline",
      color: "#4361EE",
      bgColor: "#4361EE20",
      unit: "km",
    },
    {
      id: "totalActivities", // Matches Firestore field on user doc
      label: "Activities",
      icon: "fitness-outline",
      color: "#06D6A0",
      bgColor: "#06D6A020",
      unit: "",
    },
    {
      id: "completedChallenges", // Matches Firestore field on user doc
      label: "Challenges",
      icon: "trophy-outline",
      color: "#FFC107",
      bgColor: "#FFC10720",
      unit: "",
    },
  ]

  // Animation
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

  // 1. Initialize Location
  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setLocationPermission(false)
          return
        }
        setLocationPermission(true)

        const location = await Location.getCurrentPositionAsync({})
        const address = await Location.reverseGeocodeAsync(location.coords)

        if (address.length > 0) {
          const { city, region, country, isoCountryCode } = address[0]
          const locationData = {
            city: city || region,
            country,
            isoCountryCode
          }
          setUserLocation(locationData)

          if (auth.currentUser) {
            const userRef = doc(db, "users", auth.currentUser.uid)
            updateDoc(userRef, { location: locationData }).catch(e => console.log("Loc update failed", e))
          }
        }
      } catch (err) {
        console.log("Error getting location:", err)
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
        Alert.alert("Authentication Required", "Please sign in.", [{ text: "OK", onPress: navigateToDashboard }])
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [navigateToDashboard])

  // --- 2. FETCH DATA (Server-Side Pagination) ---
  const fetchData = async (reset = false) => {
    if (!isAuthenticated) return;
    if (loadingMore) return; // Prevent double fetch

    try {
      if (reset) {
        setLoading(true);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const usersRef = collection(db, "users");
      let q;

      // Determine Sort Field
      // 'totalDistance', 'totalActivities', 'completedChallenges' are fields managed by XPManager
      const orderByField = sortMetric;

      if (filterMode === 'city' && userLocation?.city) {
        // LOCAL FILTER
        // NOTE: This requires a composite index in Firestore: location.city ASC + [orderByField] DESC
        if (reset) {
          q = query(
            usersRef,
            where("location.city", "==", userLocation.city),
            orderBy(orderByField, "desc"),
            limit(PAGE_SIZE)
          );
        } else if (lastVisible) {
          q = query(
            usersRef,
            where("location.city", "==", userLocation.city),
            orderBy(orderByField, "desc"),
            startAfter(lastVisible),
            limit(PAGE_SIZE)
          );
        }
      } else {
        // GLOBAL FILTER
        if (reset) {
          q = query(
            usersRef,
            orderBy(orderByField, "desc"),
            limit(PAGE_SIZE)
          );
        } else if (lastVisible) {
          q = query(
            usersRef,
            orderBy(orderByField, "desc"),
            startAfter(lastVisible),
            limit(PAGE_SIZE)
          );
        }
      }

      // If query is undefined (e.g. no location yet), abort
      if (!q) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setHasMore(false);
        if (reset) setLeaderboardData([]);
      } else {
        const newUsers = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            username: data.displayName || data.username || "User",
            avatar: data.avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
            location: data.location,
            totalDistance: data.totalDistance || 0,
            totalActivities: data.totalActivities || 0,
            completedChallenges: data.completedChallenges || 0, // Using completedChallenges instead of dynamic 'wins'
          };
        });

        if (reset) {
          setLeaderboardData(newUsers);
        } else {
          setLeaderboardData(prev => [...prev, ...newUsers]);
        }

        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);

        // If we got less than page size, we're at the end
        if (snapshot.docs.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }

    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      if (err.message.includes("index")) {
        Alert.alert("Missing Index", "The local leaderboard requires a Firestore index. Check console link.");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  // Initial Fetch & Refresh on Filter Change
  useEffect(() => {
    fetchData(true);
  }, [isAuthenticated, sortMetric, filterMode, userLocation]); // Reset when these change

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading && !loadingMore) {
      fetchData(false);
    }
  };

  const handleMetricChange = (metric) => {
    setSortMetric(metric)
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
    // Ensure we handle numeric conversion safely
    const numValue = Number(value) || 0;

    if (metricId === "totalDistance") {
      return `${numValue.toFixed(1)} km`
    }
    return `${Math.round(numValue)}${metric?.unit || ''}`
  }

  // --- RENDERERS ---

  const renderLocationToggle = () => (
    <View style={twrnc`px-5 pb-2`}>
      <View style={twrnc`flex-row bg-[#1e293b] p-1 rounded-xl border border-[#334155]`}>
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
    </View>
  )

  const renderLeaderboardItem = ({ item, index }) => (
    <View style={twrnc`mb-3 mx-5`}>
      <View style={twrnc`bg-[#1e293b] rounded-2xl overflow-hidden border border-[#334155]`}>
        <View style={twrnc`p-4`}>
          <View style={twrnc`flex-row items-center`}>
            {/* Rank */}
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

            {/* Avatar */}
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

            {/* Info */}
            <View style={twrnc`flex-1`}>
              <CustomText style={twrnc`text-white text-base font-semibold`}>
                {item.username}
              </CustomText>
              <View style={twrnc`flex-row items-center mt-0.5`}>
                {item.location?.city && (
                  <View style={twrnc`flex-row items-center mr-2`}>
                    <Ionicons name="location-sharp" size={10} color="#64748b" style={twrnc`mr-0.5`} />
                    <CustomText style={twrnc`text-[#94a3b8] text-xs`}>
                      {item.location.city}
                    </CustomText>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Metric Highlight */}
          <View
            style={[
              twrnc`mt-4 p-3 rounded-xl flex-row items-center justify-between`,
              { backgroundColor: metrics.find((m) => m.id === sortMetric)?.bgColor },
            ]}
          >
            <View style={twrnc`flex-row items-center`}>
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
                {metrics.find((m) => m.id === sortMetric)?.label}
              </CustomText>
            </View>
            <CustomText
              style={[
                twrnc`text-lg font-bold`,
                { color: metrics.find((m) => m.id === sortMetric)?.color },
              ]}
            >
              {formatValue(item[sortMetric], sortMetric)}
            </CustomText>
          </View>
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

  const renderFooter = () => {
    if (!loadingMore) return <View style={twrnc`h-10`} />;
    return (
      <View style={twrnc`py-4`}>
        <ActivityIndicator size="small" color="#4361EE" />
      </View>
    );
  };

  if (!isAuthenticated) return <View style={twrnc`flex-1 bg-[#0f172a]`} />

  return (
    <View style={twrnc`flex-1 bg-[#0f172a]`}>
      {/* Header */}
      <View style={twrnc`relative bg-gradient-to-b from-[#1e293b] to-[#0f172a] overflow-hidden`}>
        <Animated.View
          style={[
            twrnc`absolute top-0 right-0 w-32 h-32`,
            { opacity: 0.08, transform: [{ rotate: patternRotation }] },
          ]}
        >
          <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
            {[...Array(16)].map((_, i) => (
              <View key={i} style={[twrnc`w-1/4 h-1/4 border border-indigo-400`, { transform: [{ rotate: "45deg" }] }]} />
            ))}
          </View>
        </Animated.View>

        <View style={twrnc`pt-12 pb-4 px-5 relative z-10`}>
          <TouchableOpacity onPress={navigateToDashboard} style={twrnc`mb-4 flex-row items-center`}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={twrnc`flex-row items-center justify-between mb-2`}>
            <View style={twrnc`flex-1`}>
              <CustomText style={twrnc`text-white text-3xl font-bold`}>Leaderboard</CustomText>
              <CustomText style={twrnc`text-[#94a3b8] text-sm mt-1`}>
                {filterMode === 'city' ? 'Local Champions' : 'Global Rankings'}
              </CustomText>
            </View>
            <TouchableOpacity onPress={handleRefresh} style={twrnc`bg-[#1e293b] p-3 rounded-xl border border-[#334155]`}>
              {refreshing ? <ActivityIndicator size="small" color="#4361EE" /> : <Ionicons name="refresh" size={20} color="#4361EE" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {renderLocationToggle()}

      <View style={twrnc`px-5 py-4`}>
        <View style={twrnc`flex-row gap-3`}>
          {metrics.map((metric) => renderMetricButton(metric))}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={twrnc`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#4361EE" />
        </View>
      ) : leaderboardData.length > 0 ? (
        <FlatList
          data={leaderboardData}
          keyExtractor={(item) => item.uid}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={twrnc`pb-4`}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      ) : (
        <View style={twrnc`flex-1 items-center justify-center p-6`}>
          <Ionicons name="location-outline" size={64} color="#64748b" style={twrnc`mb-4`} />
          <CustomText style={twrnc`text-white text-xl font-bold mb-2 text-center`}>No Competitors Found</CustomText>
          <CustomText style={twrnc`text-[#94a3b8] text-center mb-6`}>
            {filterMode === 'city' ? `Be the first in ${userLocation?.city || 'this area'}!` : "Start tracking to join."}
          </CustomText>
        </View>
      )}
    </View>
  )
}

export default LeaderboardScreen
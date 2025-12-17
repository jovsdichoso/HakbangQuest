"use client"

import { useState, useEffect, useRef } from "react"
import { Modal, View, ScrollView, Image, ActivityIndicator, Dimensions, TouchableOpacity, Animated } from "react-native"
import Ionicons from "react-native-vector-icons/Ionicons"
import AnimatedButton from "../buttons/AnimatedButton"
import CustomText from "../CustomText"
import CustomModal from "../CustomModal"
import twrnc from "twrnc"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { db } from "../../firebaseConfig"

const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"

const { width } = Dimensions.get("window")

const ChallengeDetailsModal = ({
  isVisible,
  onClose,
  selectedChallenge: initialChallenge,
  setSelectedChallenge,
  auth,
  activities = [],
  joiningChallenges = {},
  handleJoinChallenge,
  navigateToActivityWithChallenge,
  handleEditChallenge,
  handleDeleteChallenge,
  creatingChallenge = false,
  handleStartChallenge,
  startingChallenge = false,
  onShowDuoVs,
}) => {
  const [selectedChallenge, setLocalChallenge] = useState(initialChallenge ? { ...initialChallenge } : null)
  const [participantsData, setParticipantsData] = useState({})
  const [activeTab, setActiveTab] = useState("details") // "details" | "leaderboard"

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const tabIndicatorAnim = useRef(new Animated.Value(0)).current
  const summaryFadeAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current
  const leaderboardAnimRefs = useRef([]).current
  const [showStartWarning, setShowStartWarning] = useState(false);


  // Keep local state in sync
  useEffect(() => {
    if (initialChallenge) {
      setLocalChallenge({ ...initialChallenge })
    }
  }, [initialChallenge])

  // Entrance animations when modal opens
  useEffect(() => {
    if (isVisible) {
      // Reset animations
      fadeAnim.setValue(0)
      slideAnim.setValue(50)
      summaryFadeAnims.forEach((anim) => anim.setValue(0))

      // Fade in main content
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start()

      // Slide up content
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start()

      // Stagger summary cards
      Animated.stagger(
        150,
        summaryFadeAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ),
      ).start()
    }
  }, [isVisible])

  // Tab switch animation
  useEffect(() => {
    Animated.spring(tabIndicatorAnim, {
      toValue: activeTab === "details" ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start()
  }, [activeTab])

  const getDateFromTimestamp = (timestamp) => {
    try {
      if (!timestamp) return null
      if (timestamp.toDate) return timestamp.toDate()
      if (typeof timestamp === "string" || typeof timestamp === "number") {
        const d = new Date(timestamp)
        return isNaN(d.getTime()) ? null : d
      }
      if (timestamp instanceof Date) return timestamp
      return null
    } catch {
      return null
    }
  }

  // Real-time updates
  useEffect(() => {
    if (!initialChallenge?.id) return
    const challengeRef = doc(db, "challenges", initialChallenge.id)

    const unsub = onSnapshot(challengeRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const withId = { ...data, id: snap.id }
      setLocalChallenge(withId)
      if (typeof setSelectedChallenge === "function") {
        setSelectedChallenge(withId)
      }
    })

    return () => unsub()
  }, [initialChallenge?.id])

  // Fetch participants
  useEffect(() => {
    const fetchUsers = async () => {
      if (!selectedChallenge) return

      const ids = [...(selectedChallenge.participants || []), ...(selectedChallenge.invitedUsers || [])]

      const uniqueIds = Array.from(new Set(ids))
      if (uniqueIds.length === 0) {
        setParticipantsData({})
        return
      }

      const newData = {}
      for (const uid of uniqueIds) {
        try {
          const snap = await getDoc(doc(db, "users", uid))
          if (snap.exists()) newData[uid] = snap.data()
        } catch (err) {
          console.error("Error fetching user:", uid, err)
        }
      }
      setParticipantsData(newData)
    }

    fetchUsers()
  }, [selectedChallenge])

  if (!selectedChallenge) return null

  const endDate = getDateFromTimestamp(selectedChallenge.endDate)
  const progressMap = selectedChallenge.progress || {}
  const participantIds = selectedChallenge.participants || []

  const leaderboard = participantIds
    .map((uid) => ({
      uid,
      progress: progressMap[uid] || 0,
      name: participantsData[uid]?.displayName || participantsData[uid]?.username || "Unknown",
      avatar: participantsData[uid]?.avatar || DEFAULT_AVATAR,
    }))
    .sort((a, b) => b.progress - a.progress)

  const titleSize = width < 360 ? "text-xl" : "text-2xl"
  const bodySize = width < 360 ? "text-sm" : "text-base"
  const smallSize = width < 360 ? "text-xs" : "text-sm"

  const isCreator = auth?.currentUser?.uid === selectedChallenge.createdBy
  const isParticipantsComplete = selectedChallenge.participants?.length === selectedChallenge.maxParticipants

  // Get activity details - handle both type and activityType fields, case-insensitive
  const challengeType = selectedChallenge.type || selectedChallenge.activityType
  const activityData = activities.find((a) => a.id.toLowerCase() === challengeType?.toLowerCase())
  const activityColor = activityData?.color || "#FFC107"
  const activityIcon = activityData?.icon
  const activityName = activityData?.name || "Activity"

  // Calculate remaining time
  const getRemainingTime = () => {
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

  // Get creator info
  const creatorData = participantsData[selectedChallenge.createdBy] || {}

  const tabWidth = (width - 64) / 2 // Account for padding

  return (
    <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
        <Animated.View
          style={[
            twrnc`bg-[#121826] rounded-t-3xl p-4 h-4/5`,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={twrnc`flex-row justify-between items-center mb-4`}>
            <CustomText weight="bold" style={twrnc`text-white ${titleSize} flex-1`}>
              {selectedChallenge.title || "Challenge"}
            </CustomText>

            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close challenge details"
              style={twrnc`bg-[#2A2E3A] p-2 rounded-2xl`}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Activity Header Card */}
            <Animated.View style={[twrnc`mb-4 self-center`, { opacity: fadeAnim }]}>
              <View
                style={[twrnc`w-24 h-24 rounded-3xl items-center justify-center`, { backgroundColor: activityColor }]}
              >
                {activityIcon ? (
                  <Image source={activityIcon} style={twrnc`w-14 h-14`} resizeMode="contain" />
                ) : (
                  <View style={twrnc`items-center`}>
                    <Ionicons name="fitness" size={48} color="#FFFFFF" />
                  </View>
                )}
              </View>
            </Animated.View>

            {/* Summary Pills with Stagger Animation */}
            <View style={twrnc`flex-row justify-between mb-6 px-2`}>
              <Animated.View
                style={[twrnc`bg-[#2A2E3A] rounded-2xl px-4 py-3 flex-1 mx-1`, { opacity: summaryFadeAnims[0] }]}
              >
                <View style={twrnc`flex-row items-center justify-center`}>
                  <Ionicons name="timer-outline" size={16} color="#FFC107" />
                  <CustomText weight="bold" style={twrnc`text-white text-sm ml-2`}>
                    {getRemainingTime()}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-xs text-center mt-1`}>Remaining</CustomText>
              </Animated.View>

              <Animated.View
                style={[twrnc`bg-[#2A2E3A] rounded-2xl px-4 py-3 flex-1 mx-1`, { opacity: summaryFadeAnims[1] }]}
              >
                <View style={twrnc`flex-row items-center justify-center`}>
                  <Image source={{ uri: creatorData.avatar || DEFAULT_AVATAR }} style={twrnc`w-4 h-4 rounded-full`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm ml-2`} numberOfLines={1}>
                    {creatorData.displayName?.split(" ")[0] || "Host"}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-xs text-center mt-1`}>Created By</CustomText>
              </Animated.View>

              <Animated.View
                style={[twrnc`bg-[#2A2E3A] rounded-2xl px-4 py-3 flex-1 mx-1`, { opacity: summaryFadeAnims[2] }]}
              >
                <View style={twrnc`flex-row items-center justify-center`}>
                  <Ionicons name="people-outline" size={16} color="#9B5DE5" />
                  <CustomText weight="bold" style={twrnc`text-white text-sm ml-2`}>
                    {selectedChallenge.participants?.length || 0}/{selectedChallenge.maxParticipants || "∞"}
                  </CustomText>
                </View>
                <CustomText style={twrnc`text-gray-400 text-xs text-center mt-1`}>Players</CustomText>
              </Animated.View>
            </View>

            {/* Tab Switcher */}
            <View style={twrnc`mb-6`}>
              <View style={twrnc`bg-[#1E2432] rounded-2xl p-1 flex-row relative`}>
                {/* Sliding Indicator */}
                <Animated.View
                  style={[
                    twrnc`absolute bg-[#4361EE] rounded-xl top-1 bottom-1`,
                    {
                      width: `${100 / 2}%`,
                      left: 4,
                      transform: [
                        {
                          translateX: tabIndicatorAnim.interpolate({ inputRange: [0, 1], outputRange: [0, tabWidth] }),
                        },
                      ],
                    },
                  ]}
                />
                <TouchableOpacity
                  style={twrnc`flex-1 py-3 items-center justify-center z-10`}
                  onPress={() => setActiveTab("details")}
                >
                  <CustomText
                    weight={activeTab === "details" ? "bold" : "medium"}
                    style={twrnc`text-sm ${activeTab === "details" ? "text-white" : "text-gray-400"}`}
                  >
                    Details
                  </CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twrnc`flex-1 py-3 items-center justify-center z-10`}
                  onPress={() => setActiveTab("leaderboard")}
                >
                  <CustomText
                    weight={activeTab === "leaderboard" ? "bold" : "medium"}
                    style={twrnc`text-sm ${activeTab === "leaderboard" ? "text-white" : "text-gray-400"}`}
                  >
                    Leaderboard
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tab Content */}
            {activeTab === "details" ? (
              <DetailsTab
                selectedChallenge={selectedChallenge}
                participantsData={participantsData}
                bodySize={bodySize}
                smallSize={smallSize}
                DEFAULT_AVATAR={DEFAULT_AVATAR}
              />
            ) : (
              <LeaderboardTab
                leaderboard={leaderboard}
                selectedChallenge={selectedChallenge}
                bodySize={bodySize}
                smallSize={smallSize}
              />
            )}

            {/* Action Buttons */}
            <View style={twrnc`mb-4 mt-6`}>
              <View style={twrnc`flex-row justify-between mb-3`}>
                {selectedChallenge.participants?.includes(auth?.currentUser?.uid) ? (
                  <View style={twrnc`bg-[#06D6A0] py-3 rounded-xl flex-1 mr-2 items-center justify-center`}>
                    <CustomText weight="semibold" style={twrnc`text-white`}>
                      Joined
                    </CustomText>
                  </View>
                ) : (
                  <AnimatedButton
                    style={twrnc`bg-[#4361EE] py-3 rounded-xl flex-1 mr-2 items-center justify-center`}
                    onPress={() => handleJoinChallenge && handleJoinChallenge(selectedChallenge.id)}
                    disabled={joiningChallenges[selectedChallenge.id]}
                  >
                    {joiningChallenges[selectedChallenge.id] ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <CustomText weight="semibold" style={twrnc`text-white`}>
                        Join Challenge
                      </CustomText>
                    )}
                  </AnimatedButton>
                )}
                {selectedChallenge.participants?.includes(auth?.currentUser?.uid) && (
                  <>
                    {selectedChallenge.status?.global === "pending" ||
                      selectedChallenge.status?.global === "ready_to_start" ? (
                      isCreator ? (
                        <AnimatedButton
                          style={twrnc`bg-[#FFC107] py-3 rounded-xl flex-1 ml-2 items-center justify-center ${startingChallenge ? "opacity-80" : ""
                            }`}
                          onPress={() => {
                            if (!isParticipantsComplete) {
                              setShowStartWarning(true); // 🔔 show custom modal instead of alert
                              return;
                            }
                            handleStartChallenge && handleStartChallenge(selectedChallenge.id);
                          }}
                          disabled={startingChallenge}
                        >
                          <CustomText weight="semibold" style={twrnc`text-[#121826]`}>
                            {startingChallenge ? "Starting..." : "Start Challenge"}
                          </CustomText>
                        </AnimatedButton>


                      ) : (
                        <View style={twrnc`bg-gray-500 py-3 rounded-xl flex-1 ml-2 items-center justify-center`}>
                          <CustomText weight="semibold" style={twrnc`text-white`}>
                            Waiting for Host
                          </CustomText>
                        </View>
                      )
                    ) : (
                      <AnimatedButton
                        style={twrnc`bg-[#FFC107] py-3 rounded-xl flex-1 ml-2 items-center justify-center`}
                        onPress={() => {
                          if (selectedChallenge.groupType === "duo") {
                            const player1 = participantsData[selectedChallenge.createdBy]
                            const player2 =
                              participantsData[
                              selectedChallenge.participants.find((p) => p !== selectedChallenge.createdBy)
                              ]
                            if (onShowDuoVs && player1 && player2) {
                              onShowDuoVs({
                                challengeId: selectedChallenge.id,
                                player1,
                                player2,
                                stakeXP: selectedChallenge.stakeXP,
                                fullChallenge: selectedChallenge,
                              })
                            }
                          } else {
                            navigateToActivityWithChallenge(selectedChallenge)
                          }
                        }}
                      >
                        <CustomText weight="semibold" style={twrnc`text-[#121826]`}>
                          Enter Challenge
                        </CustomText>
                      </AnimatedButton>
                    )}
                  </>
                )}
              </View>
              {isCreator && (
                <View style={twrnc`flex-row justify-between`}>
                  <AnimatedButton
                    style={twrnc`bg-[#4361EE] py-3 rounded-xl flex-1 mr-2 items-center justify-center`}
                    onPress={() => handleEditChallenge && handleEditChallenge(selectedChallenge)}
                  >
                    <CustomText weight="semibold" style={twrnc`text-white`}>
                      Edit
                    </CustomText>
                  </AnimatedButton>
                  <AnimatedButton
                    style={twrnc`bg-[#EF476F] py-3 rounded-xl flex-1 ml-2 items-center justify-center ${creatingChallenge ? "opacity-80" : ""}`}
                    onPress={() => handleDeleteChallenge && handleDeleteChallenge(selectedChallenge.id)}
                    disabled={creatingChallenge}
                  >
                    {creatingChallenge ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <CustomText weight="semibold" style={twrnc`text-white`}>
                        Delete
                      </CustomText>
                    )}
                  </AnimatedButton>
                </View>
              )}
            </View>
          </ScrollView>
          <CustomModal
            visible={showStartWarning}
            onClose={() => setShowStartWarning(false)}
            type="warning"
            title="Waiting for Participants"
            message="Not all participants have joined yet. Please wait for everyone to join before starting the challenge."
            buttons={[
              {
                label: "Got it",
                style: "primary",
                action: () => {
                  setShowStartWarning(false);
                },
              },
            ]}
          />

        </Animated.View>
      </View>
    </Modal>
  )
}

// Details Tab Component
const DetailsTab = ({ selectedChallenge, participantsData, bodySize, smallSize, DEFAULT_AVATAR }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    fadeAnim.setValue(0)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Description */}
      {selectedChallenge.description ? (
        <View style={twrnc`mb-4`}>
          <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
            About
          </CustomText>
          <CustomText style={twrnc`text-gray-400 ${bodySize} leading-6`}>{selectedChallenge.description}</CustomText>
        </View>
      ) : null}
      {/* Challenge Info */}
      <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-4 mb-4`}>
        <View style={twrnc`flex-row justify-between items-center`}>
          <View style={twrnc`items-center flex-1`}>
            <Ionicons name="timer-outline" size={18} color="#FFC107" />
            <CustomText weight="bold" style={twrnc`text-white ${bodySize} mt-1`}>
              {selectedChallenge.durationMinutes || 0}m
            </CustomText>
            <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Duration</CustomText>
          </View>
          <View style={twrnc`items-center flex-1`}>
            <Ionicons name="flash-outline" size={18} color="#FFC107" />
            <CustomText weight="bold" style={twrnc`text-white ${bodySize} mt-1`}>
              {selectedChallenge.individualStake || 0} XP
            </CustomText>
            <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Stake per Player</CustomText>
          </View>
          <View style={twrnc`items-center flex-1`}>
            <Ionicons name="trophy-outline" size={18} color="#06D6A0" />
            <CustomText weight="bold" style={twrnc`text-white ${bodySize} mt-1`}>
              {selectedChallenge.stakeXP || 0} XP
            </CustomText>
            <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Total Prize Pool</CustomText>
          </View>
        </View>
      </View>
      {/* Invited Users */}
      {selectedChallenge.invitedUsers?.length > 0 && (
        <View style={twrnc`mb-4`}>
          <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
            Invited
          </CustomText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
            {selectedChallenge.invitedUsers.map((uid) => {
              const u = participantsData[uid] || {}
              const accepted = selectedChallenge.participants?.includes(uid)
              return (
                <View key={uid} style={twrnc`items-center mx-2`}>
                  <Image source={{ uri: u.avatar || DEFAULT_AVATAR }} style={twrnc`w-14 h-14 rounded-full mb-1`} />
                  <CustomText style={twrnc`text-white text-xs text-center w-16`} numberOfLines={1}>
                    {u.displayName || u.username || "Unknown"}
                  </CustomText>
                  <CustomText style={twrnc`${accepted ? "text-green-400" : "text-gray-400"} text-xs`}>
                    {accepted ? "✓ Joined" : "Pending"}
                  </CustomText>
                </View>
              )
            })}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  )
}

// Leaderboard Tab Component
const LeaderboardTab = ({ leaderboard, selectedChallenge, bodySize, smallSize }) => {
  const animRefs = useRef([]).current

  // Initialize animation refs
  if (animRefs.length !== leaderboard.length) {
    animRefs.length = 0
    leaderboard.forEach(() => {
      animRefs.push(new Animated.Value(0))
    })
  }

  useEffect(() => {
    // Stagger animation for leaderboard entries
    Animated.stagger(
      100,
      animRefs.map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
      ),
    ).start()
  }, [leaderboard.length])

  return (
    <View style={twrnc`mb-6`}>
      <CustomText weight="semibold" style={twrnc`text-white text-lg mb-3`}>
        Leaderboard
      </CustomText>
      {leaderboard.length === 0 ? (
        <CustomText style={twrnc`text-gray-400 ${smallSize} text-center py-8`}>
          No activity yet. Be the first! 🚀
        </CustomText>
      ) : (
        leaderboard.map((p, idx) => (
          <Animated.View
            key={p.uid}
            style={[
              twrnc`flex-row items-center justify-between bg-[#2A2E3A] rounded-2xl p-3 mb-2 ${idx === 0 ? "border-2 border-[#FFD700]" : ""}`,
              {
                opacity: animRefs[idx],
                transform: [{ translateY: animRefs[idx].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
              },
            ]}
          >
            <View style={twrnc`flex-row items-center flex-1`}>
              <Image source={{ uri: p.avatar }} style={twrnc`w-10 h-10 rounded-full mr-3`} />
              <View style={twrnc`flex-1`}>
                <CustomText weight="semibold" style={twrnc`text-white ${idx === 0 ? "text-[#FFD700]" : ""}`}>
                  {idx + 1}. {p.name}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 ${smallSize}`}>
                  {p.progress} {selectedChallenge.unit}
                </CustomText>
              </View>
            </View>
            {idx === 0 && (
              <View style={twrnc`flex-row items-center bg-[#FFD70020] px-3 py-1 rounded-full`}>
                <Ionicons name="trophy" size={16} color="#FFD700" style={twrnc`mr-1`} />
                <CustomText style={twrnc`text-[#FFD700] text-sm font-semibold`}>1st</CustomText>
              </View>
            )}
          </Animated.View>
        ))
      )}
    </View>
  )
}

export default ChallengeDetailsModal

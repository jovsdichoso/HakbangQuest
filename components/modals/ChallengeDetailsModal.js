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
import { checkAllParticipantsSubmitted, finalizeTimeChallenge } from "../../utils/CommunityBackend"

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
  handleAcceptChallenge,
}) => {
  const [selectedChallenge, setLocalChallenge] = useState(initialChallenge ? { ...initialChallenge } : null)
  const [participantsData, setParticipantsData] = useState({})
  const [activeTab, setActiveTab] = useState("details")

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const tabIndicatorAnim = useRef(new Animated.Value(0)).current
  const summaryFadeAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current
  const leaderboardAnimRefs = useRef([]).current
  const [showStartWarning, setShowStartWarning] = useState(false)
  const [showFinalizeWarning, setShowFinalizeWarning] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false) // State for finalization loading

  useEffect(() => {
    if (initialChallenge) {
      setLocalChallenge({ ...initialChallenge })
    }
  }, [initialChallenge])

  useEffect(() => {
    if (isVisible) {
      fadeAnim.setValue(0)
      slideAnim.setValue(50)
      summaryFadeAnims.forEach((anim) => anim.setValue(0))

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start()

      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start()

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

  useEffect(() => {
    const fetchUsers = async () => {
      if (!selectedChallenge) return

      const ids = [
        ...(selectedChallenge.participants || []),
        ...(selectedChallenge.invitedUsers || []),
        selectedChallenge.createdBy // Always include the creator
      ].filter(Boolean)

      const uniqueIds = Array.from(new Set(ids))
      if (uniqueIds.length === 0) {
        setParticipantsData({})
        return
      }

      const newData = {}
      for (const uid of uniqueIds) {
        try {
          const snap = await getDoc(doc(db, "users", uid))
          if (snap.exists()) {
            newData[uid] = snap.data()
          } else {
            // Fallback data
            newData[uid] = {
              displayName: "Unknown Player",
              username: "player",
              avatar: DEFAULT_AVATAR,
              xp: 0
            }
          }
        } catch (err) {
          console.error("Error fetching user:", uid, err)
          newData[uid] = {
            displayName: "Unknown Player",
            username: "player",
            avatar: DEFAULT_AVATAR,
            xp: 0
          }
        }
      }
      setParticipantsData(newData)
    }

    fetchUsers()
  }, [selectedChallenge?.id, selectedChallenge?.createdBy, selectedChallenge?.participants, selectedChallenge?.invitedUsers])

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
  const currentParticipantCount = selectedChallenge.participants?.length || 0
  const requiredParticipants = selectedChallenge.maxParticipants || 0

  const challengeType = (selectedChallenge.activityType || selectedChallenge.type).toLowerCase();
  const activityData = activities.find(a => {
    const activityId = a.id.toLowerCase();
    return activityId === challengeType;
  });

  const activityColor = activityData?.color || "#FFC107"
  const activityIcon = activityData?.icon
  const activityName = activityData?.name || "Activity"

  // FIX: Ensure creator data is loaded with fallback
  const creatorData = participantsData[selectedChallenge.createdBy] || {
    displayName: "Host",
    username: "host",
    avatar: DEFAULT_AVATAR
  }

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

  const tabWidth = (width - 64) / 2

  // Calculate action flags
  const currentUserId = auth?.currentUser?.uid;
  const isJoined = selectedChallenge.participants?.includes(currentUserId);
  const invitedUsersList = Array.isArray(selectedChallenge.invitedUsers)
    ? selectedChallenge.invitedUsers
    : Array.isArray(selectedChallenge.invited)
      ? selectedChallenge.invited
      : [];
  const isPublicChallenge = selectedChallenge.groupType === "public" || !selectedChallenge.groupType;

  const userIsInvited = invitedUsersList.includes(currentUserId);
  const isFull = selectedChallenge.participants?.length === selectedChallenge.maxParticipants;

  const canAcceptInvite = !isJoined && !isFull && userIsInvited && !isPublicChallenge;
  const canJoinPublic = !isJoined && !isFull && isPublicChallenge;
  const isTimeBasedRace = selectedChallenge.mode === 'time' && (selectedChallenge.groupType === 'duo' || selectedChallenge.groupType === 'lobby');

  const handleFinalize = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      const allSubmitted = checkAllParticipantsSubmitted(selectedChallenge);
      const isDuoRaceComplete = selectedChallenge.groupType === 'duo' && allSubmitted;

      // Condition 1: Solo Challenge (no other participants to wait for)
      // Condition 2: Duo Race where both submitted (Immediate Finalization)
      // Condition 3: Any other race past its end date (backend function will check time)
      const canFinalizeNow = isDuoRaceComplete || requiredParticipants <= 1;

      if (canFinalizeNow) {
        const result = await finalizeTimeChallenge(selectedChallenge.id);

        // Close modal and show success/result
        onClose();

        alert(result.message);
      } else {
        // Show warning modal for non-submitted scores
        setShowFinalizeWarning(true);
      }
    } catch (error) {
      console.error("Finalization failed:", error);
      alert(`Finalization failed: ${error.message}`);
    } finally {
      setIsFinalizing(false);
    }
  }


  return (
    <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
        <Animated.View
          style={[
            twrnc`bg-[#1F2937] rounded-t-3xl p-5 h-4/5`,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header with Colorful Inner Strip */}
          <View style={[twrnc`h-1 mb-4 rounded-full overflow-hidden`, { backgroundColor: activityColor }]}>
            <View style={twrnc`h-full flex-row`}>
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

          <View style={twrnc`flex-row justify-between items-center mb-4`}>
            <CustomText weight="bold" style={twrnc`text-white ${titleSize} flex-1`}>
              {selectedChallenge.title || "Challenge"}
            </CustomText>

            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close challenge details"
              style={[twrnc`p-2.5 rounded-xl`, { backgroundColor: `${activityColor}20` }]}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={activityColor} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Icon */}
            <Animated.View style={[twrnc`mb-4 self-center`, { opacity: fadeAnim }]}>
              <View
                style={[
                  twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                  {
                    backgroundColor: activityColor,
                    transform: [{ rotate: '5deg' }]
                  },
                ]}
              >
                {activityIcon ? (
                  <Image
                    source={activityIcon}
                    style={twrnc`w-12 h-12`}
                    resizeMode="contain"
                    tintColor="#FFFFFF"
                  />
                ) : (
                  <View style={twrnc`items-center`}>
                    <Ionicons name="fitness" size={36} color="#FFFFFF" />
                  </View>
                )}
              </View>
            </Animated.View>

            {/* Summary Cards - FIX: Display host avatar properly */}
            <View style={twrnc`flex-row justify-between mb-5 -mx-1`}>
              <Animated.View
                style={[
                  twrnc`rounded-xl px-3 py-3 flex-1 mx-1`,
                  { opacity: summaryFadeAnims[0], backgroundColor: `${activityColor}15` }
                ]}
              >
                <CustomText style={[twrnc`text-[9px] uppercase mb-1`, { color: activityColor }]}>
                  Time Left
                </CustomText>
                <CustomText weight="bold" style={[twrnc`text-sm`, { color: activityColor }]}>
                  {getRemainingTime()}
                </CustomText>
              </Animated.View>

              {/* FIX: Host card with avatar */}
              <Animated.View
                style={[twrnc`bg-[#34D399] rounded-xl px-3 py-3 flex-1 mx-1`, { opacity: summaryFadeAnims[1] }]}
              >
                <CustomText style={twrnc`text-[#064E3B] text-[9px] uppercase mb-1`}>
                  Host
                </CustomText>
                <View style={twrnc`flex-row items-center`}>
                  <Image
                    source={{ uri: creatorData.avatar || DEFAULT_AVATAR }}
                    style={twrnc`w-5 h-5 rounded-full mr-1.5`}
                  />
                  <CustomText weight="bold" style={twrnc`text-[#064E3B] text-sm flex-1`} numberOfLines={1}>
                    {creatorData.displayName?.split(" ")[0] || creatorData.username || "Host"}
                  </CustomText>
                </View>
              </Animated.View>

              <Animated.View
                style={[twrnc`bg-[#A855F7] rounded-xl px-3 py-3 flex-1 mx-1`, { opacity: summaryFadeAnims[2] }]}
              >
                <CustomText style={twrnc`text-white text-[9px] uppercase mb-1`}>
                  Players
                </CustomText>
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  {currentParticipantCount}/{requiredParticipants || "∞"}
                </CustomText>
              </Animated.View>
            </View>

            {/* Tabs */}
            <View style={twrnc`mb-5`}>
              <View style={twrnc`bg-[#111827] rounded-xl p-1 flex-row relative`}>
                <Animated.View
                  style={[
                    twrnc`absolute rounded-lg top-1 bottom-1`,
                    {
                      backgroundColor: activityColor,
                      width: `${100 / 2}%`,
                      left: 4,
                      transform: [
                        {
                          translateX: tabIndicatorAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, tabWidth],
                          }),
                        },
                      ],
                    },
                  ]}
                />

                {/* FIX: Full button touch area */}
                <TouchableOpacity
                  style={twrnc`flex-1 py-2.5 items-center justify-center z-10`}
                  onPress={() => setActiveTab("details")}
                  activeOpacity={0.7}
                >
                  <CustomText
                    weight={activeTab === "details" ? "bold" : "medium"}
                    style={twrnc`text-xs uppercase ${activeTab === "details" ? "text-white" : "text-gray-400"}`}
                  >
                    Details
                  </CustomText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={twrnc`flex-1 py-2.5 items-center justify-center z-10`}
                  onPress={() => setActiveTab("leaderboard")}
                  activeOpacity={0.7}
                >
                  <CustomText
                    weight={activeTab === "leaderboard" ? "bold" : "medium"}
                    style={twrnc`text-xs uppercase ${activeTab === "leaderboard" ? "text-white" : "text-gray-400"}`}
                  >
                    Leaderboard
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tabs Content */}
            {activeTab === "details" ? (
              <DetailsTab
                selectedChallenge={selectedChallenge}
                participantsData={participantsData}
                bodySize={bodySize}
                smallSize={smallSize}
                DEFAULT_AVATAR={DEFAULT_AVATAR}
                activityColor={activityColor}
              />
            ) : (
              <LeaderboardTab
                leaderboard={leaderboard}
                selectedChallenge={selectedChallenge}
                bodySize={bodySize}
                smallSize={smallSize}
              />
            )}

            {/* Action Buttons - FIX: Full button touch areas */}
            <View style={twrnc`mb-4 mt-6`}>

              {/* Winner Display */}
              {selectedChallenge.status?.global === "completed" && (
                <View
                  style={[
                    twrnc`p-4 rounded-xl mb-3`,
                    { backgroundColor: selectedChallenge.winnerId ? '#34D399' : '#374151' }
                  ]}
                >
                  {selectedChallenge.winnerId ? (
                    <View style={twrnc`flex-row items-center justify-between`}>
                      <CustomText weight="bold" style={twrnc`text-[#064E3B] text-base uppercase tracking-wide`}>
                        {selectedChallenge.winnerId === currentUserId ? "YOU WON!" : "Winner"}
                      </CustomText>
                      <CustomText weight="bold" style={twrnc`text-[#064E3B] text-base`}>
                        {participantsData[selectedChallenge.winnerId]?.displayName ||
                          participantsData[selectedChallenge.winnerId]?.username ||
                          "Unknown Player"}
                      </CustomText>
                    </View>
                  ) : (
                    <CustomText weight="bold" style={twrnc`text-[#9BA3AF] text-sm text-center uppercase tracking-wide`}>
                      Challenge Ended: No Winner
                    </CustomText>
                  )}
                </View>
              )}


              {/* Active Challenge Actions */}
              {selectedChallenge.status?.global !== "completed" && (
                <>
                  {/* Join/Accept Row */}
                  {(canAcceptInvite || canJoinPublic) && ( // Don't render if already joined
                    <View style={twrnc`mb-3`}>
                      {/* Accept Invite Button - FIX: Full touch area */}
                      {canAcceptInvite && (
                        <TouchableOpacity
                          style={[
                            twrnc`py-4 rounded-xl items-center justify-center`,
                            {
                              backgroundColor: joiningChallenges[selectedChallenge.id] ? '#2563EB' : '#3B82F6',
                            }
                          ]}
                          onPress={() => handleAcceptChallenge && handleAcceptChallenge(selectedChallenge.id)}
                          disabled={joiningChallenges[selectedChallenge.id]}
                          activeOpacity={0.7}
                        >
                          {joiningChallenges[selectedChallenge.id] ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                              Accept Challenge & Stake ({selectedChallenge.individualStake} XP)
                            </CustomText>
                          )}
                        </TouchableOpacity>
                      )}

                      {/* Join Public Button - FIX: Full touch area */}
                      {canJoinPublic && (
                        <TouchableOpacity
                          style={[
                            twrnc`py-4 rounded-xl items-center justify-center`,
                            {
                              backgroundColor: joiningChallenges[selectedChallenge.id] ? '#2563EB' : '#3B82F6',
                            }
                          ]}
                          onPress={() => handleJoinChallenge && handleJoinChallenge(selectedChallenge.id)}
                          disabled={joiningChallenges[selectedChallenge.id]}
                          activeOpacity={0.7}
                        >
                          {joiningChallenges[selectedChallenge.id] ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                              Join Challenge & Stake ({selectedChallenge.individualStake} XP)
                            </CustomText>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Joined Status - Displayed if already joined AND waiting for start/active */}
                  {isJoined && selectedChallenge.status?.global !== "active" && (
                    <View
                      style={[
                        twrnc`py-4 rounded-xl flex-row items-center justify-center mb-3`,
                        { backgroundColor: '#10B981' }
                      ]}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={twrnc`mr-2`} />
                      <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                        {selectedChallenge.individualStake > 0 ? "STAKE LOCKED & JOINED" : "JOINED"}
                      </CustomText>
                    </View>
                  )}


                  {/* Start/Enter Challenge Row */}
                  {selectedChallenge.participants?.includes(currentUserId) && (
                    <View style={twrnc`mb-3`}>
                      {(() => {
                        const userStatus = selectedChallenge.status?.[currentUserId];
                        const globalStatus = selectedChallenge.status?.global;

                        if (globalStatus === "pending") {
                          return isCreator ? (
                            <TouchableOpacity
                              style={[
                                twrnc`py-4 rounded-xl items-center justify-center`,
                                {
                                  backgroundColor: startingChallenge ? `${activityColor}CC` : activityColor,
                                }
                              ]}
                              onPress={() => {
                                // Logic to determine minimum players based on group type
                                let minPlayersNeeded = 1;

                                if (selectedChallenge.groupType === 'duo') {
                                  minPlayersNeeded = 2;
                                } else if (selectedChallenge.groupType === 'lobby') {
                                  minPlayersNeeded = 3; // ✅ Allow start with 3, 4, or 5 players
                                }

                                // Check against MINIMUM, not MAXIMUM (requiredParticipants)
                                if (selectedChallenge.groupType !== 'solo' && currentParticipantCount < minPlayersNeeded) {
                                  setShowStartWarning(true);
                                  return;
                                }

                                handleStartChallenge && handleStartChallenge(selectedChallenge.id);
                              }}
                              disabled={startingChallenge}
                              activeOpacity={0.7}
                            >
                              <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                                {startingChallenge ? "Starting..." : "Start Challenge"}
                              </CustomText>
                            </TouchableOpacity>
                          ) : (
                            <View style={twrnc`bg-[#374151] py-4 rounded-xl items-center justify-center`}>
                              <CustomText weight="bold" style={twrnc`text-[#9BA3AF] text-sm uppercase tracking-wide`}>
                                Waiting for Host
                              </CustomText>
                            </View>
                          );
                        }

                        if (globalStatus === "active") {
                          // Check if user has already submitted progress
                          const userProgress = progressMap?.[currentUserId] || 0;
                          const hasSubmitted = userProgress > 0;

                          if (userStatus === "completed" || hasSubmitted) {
                            return (
                              <View style={twrnc`bg-374151 py-4 rounded-xl items-center justify-center`}>
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" style={twrnc`mb-1`} />
                                <CustomText weight="bold" style={[twrnc`text-sm uppercase tracking-wide`, { color: '#10B981' }]}>
                                  {isTimeBasedRace ? "Score Submitted" : "Activity Completed"}
                                </CustomText>
                                {userProgress > 0 && (
                                  <CustomText style={[twrnc`text-xs mt-1`, { color: '#9CA3AF' }]}>
                                    Your Score: {
                                      selectedChallenge.unit === 'km' || selectedChallenge.unit === 'distance'
                                        ? userProgress.toFixed(2)
                                        : selectedChallenge.unit === 'reps' || selectedChallenge.unit === 'steps'
                                          ? Math.round(userProgress)
                                          : userProgress.toFixed(1)
                                    } {selectedChallenge.unit}
                                  </CustomText>
                                )}
                              </View>

                            );
                          }

                          return (
                            <TouchableOpacity
                              style={[
                                twrnc`py-4 rounded-xl items-center justify-center`,
                                { backgroundColor: activityColor },
                              ]}
                              onPress={() => {
                                // Trigger VS modal for Duo challenges
                                if (selectedChallenge.groupType === "duo" && selectedChallenge.participants?.length === 2) {
                                  const player1 = participantsData[selectedChallenge.createdBy];
                                  const opponentId = selectedChallenge.participants.find((p) => p !== selectedChallenge.createdBy);
                                  const player2 = participantsData[opponentId];
                                  onShowDuoVs({
                                    challengeId: selectedChallenge.id,
                                    player1: player1,
                                    player2: player2,
                                    stakeXP: selectedChallenge.stakeXP,
                                    fullChallenge: selectedChallenge,
                                  });
                                } else {
                                  // Direct navigation for Solo/Lobby
                                  navigateToActivityWithChallenge(selectedChallenge);
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                                Enter Challenge
                              </CustomText>
                            </TouchableOpacity>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}

                  {/* Creator Actions: Edit/Delete - FIX Full touch areas */}
                  {isCreator && selectedChallenge.status?.global === 'pending' && (
                    <View style={twrnc`flex-row justify-between mb-3`}>
                      <TouchableOpacity
                        style={twrnc`bg-[#3B82F6] py-4 rounded-xl flex-1 mr-2 items-center justify-center`}
                        onPress={() => handleEditChallenge(selectedChallenge)}
                        disabled={startingChallenge}  // ✅ Disable during start only
                        activeOpacity={0.7}
                      >
                        <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                          Edit
                        </CustomText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          twrnc`py-4 rounded-xl flex-1 ml-2 items-center justify-center`,
                          { backgroundColor: startingChallenge ? '#DC2626' : '#EF4444' },  // ✅ Changed to startingChallenge
                        ]}
                        onPress={() => handleDeleteChallenge(selectedChallenge.id)}
                        disabled={startingChallenge}  // ✅ Changed to startingChallenge
                        activeOpacity={0.7}
                      >
                        {startingChallenge ? (  // ✅ Changed to startingChallenge
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <CustomText weight="bold" style={twrnc`text-white text-sm uppercase tracking-wide`}>
                            Delete
                          </CustomText>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}


                  {/* Finalize Challenge Button - FIXED Call handleFinalize */}
                  {isCreator && selectedChallenge.status?.global === "active" && isTimeBasedRace && (
                    <View style={twrnc`mb-3`}>
                      {(() => {
                        const allSubmitted = checkAllParticipantsSubmitted(selectedChallenge);
                        const canFinalize = allSubmitted || isFinalizing;

                        return (
                          <>
                            <TouchableOpacity
                              style={[
                                twrnc`py-4 rounded-xl items-center justify-center`,
                                {
                                  backgroundColor: isFinalizing
                                    ? "#064E3B"
                                    : allSubmitted
                                      ? "#10B981"
                                      : "#374151"
                                },
                              ]}
                              onPress={handleFinalize}
                              disabled={!allSubmitted || isFinalizing}
                              activeOpacity={0.7}
                            >
                              {isFinalizing ? (
                                <ActivityIndicator size="small" color="white" />
                              ) : (
                                <>
                                  {!allSubmitted && (
                                    <Ionicons name="lock-closed" size={20} color="#9CA3AF" style={twrnc`mb-1`} />
                                  )}
                                  <CustomText
                                    weight="bold"
                                    style={[
                                      twrnc`text-sm uppercase tracking-wide`,
                                      { color: allSubmitted ? "#FFFFFF" : "#9CA3AF" }
                                    ]}
                                  >
                                    Finalize Challenge
                                  </CustomText>
                                </>
                              )}
                            </TouchableOpacity>

                            {!allSubmitted && (
                              <View style={twrnc`mt-2 bg-1F2937 p-3 rounded-xl flex-row items-start`}>
                                <Ionicons name="information-circle" size={16} color="#F59E0B" style={twrnc`mr-2 mt-0.5`} />
                                <CustomText style={[twrnc`text-xs flex-1`, { color: '#9CA3AF' }]}>
                                  Waiting for all participants to submit their scores before finalizing.
                                </CustomText>
                              </View>
                            )}
                          </>
                        );
                      })()}
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>

          {/* Start Warning Modal */}
          <CustomModal
            visible={showStartWarning}
            onClose={() => setShowStartWarning(false)}
            type="warning"
            title="Waiting for Participants"
            // 👇 THIS IS THE FIX:
            message={
              selectedChallenge.groupType === 'lobby'
                ? `Lobby challenges require at least 3 players to start. Currently, there are ${currentParticipantCount}.`
                : `This challenge requires ${requiredParticipants} players to start. Currently, there are ${currentParticipantCount}.`
            }
            buttons={[{ label: "Got it", style: "primary", action: () => setShowStartWarning(false) }]}
          />

          {/* Finalize Warning Modal */}
          <CustomModal
            visible={showFinalizeWarning}
            onClose={() => setShowFinalizeWarning(false)}
            type="warning"
            title="Waiting for Scores"
            message="Not all participants have submitted their scores (completed an activity) yet. Finalizing now may result in a 'No Winner' result if the scores are still zero. Are you sure you want to finalize now?"
            buttons={[
              { label: "Cancel", style: "secondary", action: () => setShowFinalizeWarning(false) },
              {
                label: "Finalize Anyway", style: "danger", action: async () => {
                  setShowFinalizeWarning(false);
                  await handleFinalize(); // Re-trigger finalize, which will run the logic again
                }
              },
            ]}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const DetailsTab = ({ selectedChallenge, participantsData, bodySize, smallSize, DEFAULT_AVATAR, activityColor }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    fadeAnim.setValue(0)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [])

  const individualStake = selectedChallenge.individualStake || Math.round((selectedChallenge.stakeXP / (selectedChallenge.maxParticipants || 1)) * 10) / 10;
  const prizePool = selectedChallenge.stakeXP || 0;


  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {selectedChallenge.description ? (
        <View style={[twrnc`mb-4 p-3 rounded-xl bg-[#111827] border-l-4`, { borderLeftColor: activityColor }]}>
          <CustomText weight="semibold" style={twrnc`text-white text-sm mb-1`}>
            About
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-xs leading-5`}>{selectedChallenge.description}</CustomText>
        </View>
      ) : null}

      {/* Stats Cards Grid */}
      <View style={twrnc`flex-row flex-wrap -mx-1 mb-4`}>
        <View style={twrnc`w-1/3 px-1 mb-2`}>
          <View style={[twrnc`rounded-xl p-3`, { backgroundColor: `${activityColor}20` }]}>
            <CustomText style={[twrnc`text-[9px] uppercase mb-1`, { color: activityColor }]}>
              Duration
            </CustomText>
            <CustomText weight="bold" style={[twrnc`text-sm`, { color: activityColor }]}>
              {selectedChallenge.durationMinutes || 0}m
            </CustomText>
          </View>
        </View>

        <View style={twrnc`w-1/3 px-1 mb-2`}>
          <View style={twrnc`bg-[#F87171] rounded-xl p-3`}>
            <CustomText style={twrnc`text-[#7F1D1D] text-[9px] uppercase mb-1`}>
              Stake
            </CustomText>
            <CustomText weight="bold" style={twrnc`text-[#7F1D1D] text-sm`}>
              {individualStake} XP
            </CustomText>
          </View>
        </View>

        <View style={twrnc`w-1/3 px-1 mb-2`}>
          <View style={twrnc`bg-[#34D399] rounded-xl p-3`}>
            <CustomText style={twrnc`text-[#064E3B] text-[9px] uppercase mb-1`}>
              Prize
            </CustomText>
            <CustomText weight="bold" style={twrnc`text-[#064E3B] text-sm`}>
              {prizePool} XP
            </CustomText>
          </View>
        </View>
      </View>

      {selectedChallenge.invitedUsers?.length > 0 && (
        <View style={twrnc`mb-4`}>
          <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
            Invited Players
          </CustomText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
            {selectedChallenge.invitedUsers.map((uid) => {
              const u = participantsData[uid] || {}
              const isCreator = uid === selectedChallenge.createdBy
              const accepted = !isCreator && selectedChallenge.participants?.includes(uid)
              return (
                <View key={uid} style={twrnc`items-center mx-2`}>
                  <Image source={{ uri: u.avatar || DEFAULT_AVATAR }} style={twrnc`w-12 h-12 rounded-full mb-1.5`} />
                  <CustomText style={twrnc`text-white text-xs text-center w-14`} numberOfLines={1}>
                    {u.displayName || u.username || "Unknown"}
                  </CustomText>
                  <View style={[
                    twrnc`px-2 py-0.5 rounded-full mt-1`,
                    { backgroundColor: accepted ? '#10B981' : '#374151' }
                  ]}>
                    <CustomText style={twrnc`text-white text-[9px] uppercase`}>
                      {isCreator ? "Host" : accepted ? "Joined" : "Pending"}
                    </CustomText>
                  </View>
                </View>
              )
            })}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  )
}

const LeaderboardTab = ({ leaderboard, selectedChallenge, bodySize, smallSize }) => {
  const animRefs = useRef([]).current

  if (animRefs.length !== leaderboard.length) {
    animRefs.length = 0
    leaderboard.forEach(() => {
      animRefs.push(new Animated.Value(0))
    })
  }

  useEffect(() => {
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

  // Format progress based on unit type
  const formatProgress = (progress, unit) => {
    if (unit === 'km' || unit === 'distance') {
      return progress.toFixed(2); // 2 decimals for distance
    } else if (unit === 'reps' || unit === 'steps') {
      return Math.round(progress); // No decimals for counts
    } else if (unit === 'duration' || unit === 'minutes') {
      return progress.toFixed(1); // 1 decimal for time
    }
    return progress.toFixed(1); // Default
  };

  return (
    <View style={twrnc`mb-6`}>
      <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
        Leaderboard
      </CustomText>
      {leaderboard.length === 0 ? (
        <View style={twrnc`bg-[#111827] rounded-xl p-6 items-center`}>
          <CustomText style={twrnc`text-gray-400 text-xs text-center`}>
            No activity yet. Be the first!
          </CustomText>
        </View>
      ) : (
        leaderboard.map((p, idx) => (
          <Animated.View
            key={p.uid}
            style={[
              twrnc`flex-row items-center justify-between bg-[#111827] rounded-xl p-3 mb-2`,
              {
                opacity: animRefs[idx],
                transform: [
                  {
                    translateY: animRefs[idx].interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={twrnc`flex-row items-center flex-1`}>
              <View style={[
                twrnc`w-6 h-6 rounded-full items-center justify-center mr-3`,
                { backgroundColor: idx === 0 ? '#FBBF24' : '#374151' }
              ]}>
                <CustomText weight="bold" style={[
                  twrnc`text-xs`,
                  { color: idx === 0 ? '#78350F' : '#9BA3AF' }
                ]}>
                  {idx + 1}
                </CustomText>
              </View>

              <Image source={{ uri: p.avatar }} style={twrnc`w-9 h-9 rounded-full mr-2.5`} />

              <View style={twrnc`flex-1`}>
                <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                  {p.name}
                </CustomText>
                <CustomText style={twrnc`text-gray-400 text-xs`}>
                  {formatProgress(p.progress, selectedChallenge.unit)} {selectedChallenge.unit}
                </CustomText>
              </View>
            </View>

            {idx === 0 && (selectedChallenge.status?.global === 'completed' || selectedChallenge.status?.global === 'active') && (
              <View style={twrnc`bg-[#FBBF24] px-2.5 py-1 rounded-full`}>
                <CustomText weight="bold" style={twrnc`text-[#78350F] text-[9px] uppercase`}>
                  {selectedChallenge.status?.global === 'completed' ? 'Winner' : 'Leader'}
                </CustomText>
              </View>
            )}
          </Animated.View>
        ))
      )}
    </View>
  )
}


export default ChallengeDetailsModal
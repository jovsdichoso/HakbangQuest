import React from 'react';
import { Modal, View, ScrollView, Image, ActivityIndicator, Dimensions } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AnimatedButton from '../buttons/AnimatedButton';
import CustomText from '../CustomText';
import twrnc from 'twrnc';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig"; // adjust this path if needed
import { useEffect, useState } from 'react';

const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

const { width } = Dimensions.get("window");

const ChallengeDetailsModal = ({
  isVisible,
  onClose,
  selectedChallenge,
  auth,
  activities,
  joiningChallenges,
  handleJoinChallenge,
  navigateToActivityWithChallenge,
  handleEditChallenge,
  handleDeleteChallenge,
  creatingChallenge,
}) => {
  if (!selectedChallenge) return null;

  const [participantsData, setParticipantsData] = useState({});

  const getDateFromTimestamp = (timestamp) => {
    try {
      if (!timestamp) return null;
      if (timestamp.toDate) return timestamp.toDate();
      if (typeof timestamp === "string" || typeof timestamp === "number") {
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? null : date;
      }
      if (timestamp instanceof Date) return timestamp;
      return null;
    } catch {
      return null;
    }
  };



  const endDate = getDateFromTimestamp(selectedChallenge.endDate);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!selectedChallenge?.participants && !selectedChallenge?.invitedUsers) return;

      const newData = {};
      const userIds = [...new Set([
        ...(selectedChallenge.participants || []),
        ...(selectedChallenge.invitedUsers || []),
      ])];

      for (const userId of userIds) {
        try {
          const snap = await getDoc(doc(db, "users", userId));
          if (snap.exists()) {
            newData[userId] = snap.data();
          } else {
            console.warn(`No user data found for ID: ${userId}`);
          }
        } catch (err) {
          console.error("Error fetching user:", userId, err);
        }
      }
      setParticipantsData(newData);
    };

    fetchUsers();
  }, [selectedChallenge]);




  const titleSize = width < 360 ? "text-xl" : "text-2xl";
  const bodySize = width < 360 ? "text-sm" : "text-base";
  const smallSize = width < 360 ? "text-xs" : "text-sm";

  return (
    <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
        <View style={twrnc`bg-[#121826] rounded-t-3xl p-4 h-4/5`}>
          {/* Header */}
          <View style={twrnc`flex-row justify-between items-center mb-4`}>
            <CustomText weight="bold" style={twrnc`text-white ${titleSize} flex-1`}>
              {selectedChallenge.title}
            </CustomText>
            <AnimatedButton
              style={twrnc`bg-[#2A2E3A] p-2 rounded-2xl`}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityLabel="Close challenge details"
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </AnimatedButton>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Icon */}
            <View style={twrnc`w-20 h-20 rounded-3xl bg-[#FFC10720] items-center justify-center mb-4 self-center`}>
              {selectedChallenge.icon ? (
                <Image source={{ uri: selectedChallenge.icon }} style={twrnc`w-12 h-12`} resizeMode="contain" />
              ) : (
                <Ionicons name="trophy" size={40} color="#FFC107" />
              )}
            </View>

            {/* Description */}
            {selectedChallenge.description && (
              <View style={twrnc`mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white text-lg mb-1`}>
                  Description
                </CustomText>
                <CustomText style={twrnc`text-gray-400 ${bodySize} leading-6`}>
                  {selectedChallenge.description}
                </CustomText>
              </View>
            )}

            {/* Challenge Info */}
            <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-4 mb-4`}>
              <View style={twrnc`flex-row justify-between items-center mb-3`}>
                {/* Activity */}
                <View style={twrnc`items-center flex-1 px-1`}>
                  <View style={twrnc`w-9 h-9 rounded-xl bg-[#4361EE20] items-center justify-center mb-1`}>
                    <Image
                      source={activities.find((a) => a.id === selectedChallenge.activityType)?.icon}
                      style={twrnc`w-5 h-5 tint-[#4361EE]`}
                      resizeMode="contain"
                    />
                  </View>
                  <CustomText weight="bold" style={twrnc`text-white ${bodySize}`}>
                    {selectedChallenge.activityType || "N/A"}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Activity</CustomText>
                </View>

                {/* Goal */}
                {selectedChallenge.goal && selectedChallenge.unit && (
                  <View style={twrnc`items-center flex-1 px-1`}>
                    <View style={twrnc`w-9 h-9 rounded-xl bg-[#06D6A020] items-center justify-center mb-1`}>
                      <Ionicons name="flag-outline" size={18} color="#06D6A0" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white ${bodySize}`}>
                      {selectedChallenge.goal} {selectedChallenge.unit}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Goal</CustomText>
                  </View>
                )}

                {/* Difficulty */}
                {selectedChallenge.difficulty && (
                  <View style={twrnc`items-center flex-1 px-1`}>
                    <View style={twrnc`w-9 h-9 rounded-xl bg-[#EF476F20] items-center justify-center mb-1`}>
                      <Ionicons name="flash-outline" size={18} color="#EF476F" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white ${bodySize} capitalize`}>
                      {selectedChallenge.difficulty}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Difficulty</CustomText>
                  </View>
                )}
              </View>

              <View style={twrnc`flex-row justify-between items-center mt-3`}>
                {/* End Date */}
                <View style={twrnc`items-center flex-1 px-1`}>
                  <Ionicons name="time-outline" size={18} color="#FFC107" />
                  <CustomText weight="bold" style={twrnc`text-white ${bodySize}`}>
                    {endDate
                      ? endDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                      : "N/A"}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 ${smallSize}`}>End</CustomText>
                </View>

                {/* Participants Count */}
                <View style={twrnc`items-center flex-1 px-1`}>
                  <Ionicons name="people-outline" size={18} color="#9B5DE5" />
                  <CustomText weight="bold" style={twrnc`text-white ${bodySize}`}>
                    {selectedChallenge.participants?.length || 0}/{selectedChallenge.maxParticipants || "∞"}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Players</CustomText>
                </View>

                {/* Status */}
                <View style={twrnc`items-center flex-1 px-1`}>
                  <Ionicons name="analytics-outline" size={18} color="#F15BB5" />
                  <CustomText weight="bold" style={twrnc`text-white ${bodySize} capitalize`}>
                    {selectedChallenge.status?.[auth.currentUser?.uid]?.replace(/_/g, " ") || "Pending"}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Status</CustomText>
                </View>
              </View>
            </View>

            {/* Invited Users List */}
            {selectedChallenge.invitedUsers?.length > 0 && (
              <View style={twrnc`mb-4`}>
                <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                  Invited Users
                </CustomText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
                  {selectedChallenge.invitedUsers.map((userId) => {
                    const user = participantsData[userId] || {};
                    return (
                      <View key={userId} style={twrnc`items-center mx-2`}>
                        <Image
                          source={{ uri: user.avatar || DEFAULT_AVATAR }}
                          style={twrnc`w-12 h-12 rounded-full mb-1`}
                        />
                        <CustomText
                          style={twrnc`text-gray-300 text-xs text-center w-16`}
                          numberOfLines={1}
                        >
                          {user.username || user.displayName || "Unknown User"}
                        </CustomText>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Progress Section */}
            <View style={twrnc`mb-4`}>
              <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                Your Progress
              </CustomText>
              <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-3`}>
                <View style={twrnc`flex-row justify-between mb-1`}>
                  <CustomText style={twrnc`text-gray-400 ${smallSize}`}>Progress</CustomText>
                  <CustomText style={twrnc`text-white ${smallSize}`}>
                    {selectedChallenge.progress?.[auth.currentUser?.uid] || 0}/{selectedChallenge.goal}{" "}
                    {selectedChallenge.unit}
                  </CustomText>
                </View>
                <View style={twrnc`w-full bg-[#3A3F4B] rounded-full h-2 mb-2`}>
                  <View
                    style={[
                      twrnc`bg-[#4361EE] h-2 rounded-full`,
                      {
                        width: `${Math.min(
                          100,
                          ((selectedChallenge.progress?.[auth.currentUser?.uid] || 0) / selectedChallenge.goal) * 100
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={twrnc`flex-row justify-between mb-3`}>
              {/* Join/Joined */}
              {selectedChallenge.participants?.includes(auth.currentUser?.uid) ? (
                <View style={twrnc`bg-[#06D6A0] py-3 rounded-2xl flex-1 mr-2 items-center opacity-50`}>
                  <Ionicons name="checkmark-circle" size={16} color="white" />
                  <CustomText weight="semibold" style={twrnc`text-white ml-1`}>
                    Joined
                  </CustomText>
                </View>
              ) : (
                <AnimatedButton
                  style={twrnc`bg-[#4361EE] py-3 rounded-2xl flex-1 mr-2 items-center`}
                  onPress={() => handleJoinChallenge(selectedChallenge.id)}
                  disabled={joiningChallenges[selectedChallenge.id]}
                >
                  {joiningChallenges[selectedChallenge.id] ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View style={twrnc`flex-row items-center`}>
                      <Ionicons name="add-circle-outline" size={16} color="white" />
                      <CustomText weight="semibold" style={twrnc`text-white ml-1`}>
                        Join
                      </CustomText>
                    </View>
                  )}
                </AnimatedButton>
              )}

              {/* Start */}
              {selectedChallenge.participants?.includes(auth.currentUser?.uid) && (
                <AnimatedButton
                  style={twrnc`bg-[#FFC107] py-3 rounded-2xl flex-1 ml-2 items-center`}
                  onPress={() => navigateToActivityWithChallenge(selectedChallenge)}
                >
                  <View style={twrnc`flex-row items-center`}>
                    <Ionicons name="play-circle-outline" size={16} color="#121826" />
                    <CustomText weight="semibold" style={twrnc`text-[#121826] ml-1`}>
                      Start
                    </CustomText>
                  </View>
                </AnimatedButton>
              )}
            </View>

            {/* Owner Controls */}
            {auth.currentUser?.uid === selectedChallenge.createdBy && (
              <View style={twrnc`flex-row justify-between`}>
                <AnimatedButton
                  style={twrnc`bg-[#4361EE] py-3 rounded-2xl flex-1 mr-2 items-center`}
                  onPress={() => handleEditChallenge(selectedChallenge)}
                >
                  <Ionicons name="create-outline" size={16} color="white" />
                  <CustomText weight="semibold" style={twrnc`text-white ml-1`}>
                    Edit
                  </CustomText>
                </AnimatedButton>
                <AnimatedButton
                  style={twrnc`${creatingChallenge ? "bg-[#7F1D1D80]" : "bg-[#EF476F]"} py-3 rounded-2xl flex-1 ml-2 items-center`}
                  onPress={() => handleDeleteChallenge(selectedChallenge.id)}
                  disabled={creatingChallenge}
                >
                  {creatingChallenge ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View style={twrnc`flex-row items-center`}>
                      <Ionicons name="trash-outline" size={16} color="white" />
                      <CustomText weight="semibold" style={twrnc`text-white ml-1`}>
                        Delete
                      </CustomText>
                    </View>
                  )}
                </AnimatedButton>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default ChallengeDetailsModal;

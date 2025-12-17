"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Modal, View, ScrollView, TextInput, Image, ActivityIndicator, Animated, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import CustomText from "../CustomText";
import twrnc from "twrnc";

const DEFAULT_AVATAR =
  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

// Memoized Components for Better Performance
const GroupTypeButton = memo(({ groupType, isSelected, onPress }) => (
  <TouchableOpacity
    style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center min-w-[100px] ${isSelected
      ? "border-2 border-[#FFC107] bg-[#FFC10720]"
      : "bg-[#2A2E3A]"
      }`}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <CustomText
      weight={isSelected ? "bold" : "medium"}
      style={twrnc`text-white text-center text-sm`}
    >
      {groupType.name}
    </CustomText>
  </TouchableOpacity>
));

const ActivityButton = memo(({ activity, isSelected, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={twrnc`mr-4`}
    activeOpacity={0.7}
  >
    <View
      style={twrnc`items-center justify-center w-28 rounded-2xl p-4 ${isSelected
        ? `border-2 border-[${activity.color}] bg-[#2A2E3A]`
        : "bg-[#2A2E3A]"
        }`}
    >
      <View
        style={[
          twrnc`w-14 h-14 rounded-2xl items-center justify-center mb-2`,
          {
            backgroundColor: isSelected ? activity.color : "#3A3F4B",
          },
        ]}
      >
        <Image
          source={activity.icon}
          style={twrnc`w-7 h-7`}
          resizeMode="contain"
        />
      </View>
      <CustomText
        weight={isSelected ? "bold" : "medium"}
        style={twrnc`text-white text-sm text-center`}
        numberOfLines={1}
      >
        {activity.name}
      </CustomText>
    </View>
  </TouchableOpacity>
));

const FriendButton = memo(({ friend, isSelected, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={twrnc`mr-4`}
    activeOpacity={0.7}
  >
    <View
      style={twrnc`items-center w-24 rounded-2xl p-3 ${isSelected
        ? "border-2 border-[#FFC107] bg-[#1E2432]"
        : "bg-[#1E2432]"
        }`}
    >
      <Image
        source={{ uri: friend.avatar || DEFAULT_AVATAR }}
        style={twrnc`w-14 h-14 rounded-full mb-2`}
        resizeMode="cover"
      />
      <CustomText
        weight={isSelected ? "bold" : "medium"}
        style={twrnc`text-white text-sm text-center`}
        numberOfLines={1}
      >
        {friend.displayName || friend.username || "Friend"}
      </CustomText>
      {isSelected && (
        <View style={twrnc`mt-1 bg-[#FFC107] px-2 py-0.5 rounded-full`}>
          <CustomText style={twrnc`text-xs text-black font-semibold`}>
            Selected
          </CustomText>
        </View>
      )}
    </View>
  </TouchableOpacity>
));

const CreateChallengeModal = ({
  isVisible,
  onClose,
  newChallenge,
  setNewChallenge,
  friends,
  activities,
  CHALLENGE_GROUP_TYPES,
  handleCreateChallenge,
  creatingChallenge,
}) => {
  const [selectedDurationKey, setSelectedDurationKey] = useState(null);
  const [stakeXP, setStakeXP] = useState(50);
  const [prizePool, setPrizePool] = useState(100);
  const [inviteError, setInviteError] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const durationOptions = useMemo(() => [
    { label: "1m", minutes: 1 },
    { label: "5m", minutes: 5 },
    { label: "10m", minutes: 10 },
    { label: "30m", minutes: 30 },
    { label: "1h", minutes: 60 },
    { label: "12h", minutes: 720 },
    { label: "1d", minutes: 1440 },
  ], []);

  const updateDurationFields = useCallback((minutes) => {
    const now = Date.now();
    const endDate = new Date(now + minutes * 60 * 1000);
    setNewChallenge((prev) => ({
      ...prev,
      endDate,
      durationMinutes: minutes,
    }));
  }, [setNewChallenge]);

  // Update the existing useEffect to only calculate base XP
  useEffect(() => {
    const mins = newChallenge.durationMinutes || 0;
    let baseXP = 50;

    if (mins >= 2 && mins <= 5) baseXP = 100;
    else if (mins > 5 && mins <= 10) baseXP = 150;
    else if (mins > 10 && mins <= 30) baseXP = 200;
    else if (mins > 30 && mins <= 60) baseXP = 300;
    else if (mins > 60 && mins <= 180) baseXP = 500;
    else if (mins > 180 && mins <= 360) baseXP = 800;
    else if (mins > 360 && mins <= 720) baseXP = 1000;
    else if (mins > 720) baseXP = 1500;

    setStakeXP(baseXP);
  }, [newChallenge.durationMinutes, setNewChallenge]);

  // Fast entrance animations
  useEffect(() => {
    if (isVisible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, fadeAnim, slideAnim]);


  // Add these helper functions inside your component
  const getParticipantCount = useCallback(() => {
    const baseCount = 1; // Always include yourself

    if (newChallenge.groupType === 'solo') {
      return 1;
    } else if (newChallenge.groupType === 'duo') {
      return baseCount + (newChallenge.selectedFriendsForGroupChallenge?.length || 0);
    } else {
      // For group challenges, count selected friends + yourself
      return baseCount + (newChallenge.selectedFriendsForGroupChallenge?.length || 0);
    }
  }, [newChallenge.groupType, newChallenge.selectedFriendsForGroupChallenge]);

  useEffect(() => {
    const calculatedStake = calculateStakeXP();
    setNewChallenge(prev => ({
      ...prev,
      stakeXP: calculatedStake
    }));
  }, [calculateStakeXP, setNewChallenge]);

  const calculateStakeXP = useCallback(() => {
    const baseXP = stakeXP; 
    const participantCount = getParticipantCount();

    // Scale stake based on participant count
    if (newChallenge.groupType === 'solo') {
      return baseXP;
    } else if (newChallenge.groupType === 'duo') {
      return baseXP * 1.5; // 50% more for duos
    } else {
      // For groups, scale based on size
      return baseXP * Math.min(participantCount, 5); // Cap at 5x for balance
    }
  }, [stakeXP, getParticipantCount, newChallenge.groupType]);

  const calculatePrizePool = useCallback(() => {
    const participantStake = calculateStakeXP();
    const participantCount = getParticipantCount();

    // Prize pool = total stakes from all participants
    return participantStake * participantCount;
  }, [calculateStakeXP, getParticipantCount]);

  // Optimized handlers with stable references
  const handleFriendSelect = useCallback((friendId) => {
    setNewChallenge((prev) => {
      let updatedList = [...(prev.selectedFriendsForGroupChallenge || [])];
      const friend = friends.find(f => f.id === friendId);

      if (prev.groupType === "duo") {
        updatedList = updatedList[0]?.id === friendId ? [] : [friend];
      } else {
        const exists = updatedList.find((f) => f.id === friendId);

        if (exists) {
          updatedList = updatedList.filter((f) => f.id !== friendId);
        } else {
          if (updatedList.length >= 4) {
            setInviteError("Group challenges can only have up to 5 members including you.");
            setTimeout(() => setInviteError(null), 3000);
            return prev;
          }
          updatedList.push(friend);
        }
      }

      setInviteError(null);
      return {
        ...prev,
        selectedFriendsForGroupChallenge: updatedList,
      };
    });
  }, [friends, setNewChallenge]);

  const handleGroupTypeSelect = useCallback((groupTypeId) => {
    setNewChallenge((prev) => ({
      ...prev,
      groupType: groupTypeId,
      selectedFriendsForGroupChallenge: [],
    }));
  }, [setNewChallenge]);

  const handleActivitySelect = useCallback((activityId, activityUnit) => {
    setNewChallenge((prev) => ({
      ...prev,
      type: activityId,
      goal: null,
      unit: activityUnit,
    }));
  }, [setNewChallenge]);

  const handleDurationSelect = useCallback((minutes, label) => {
    updateDurationFields(minutes);
    setSelectedDurationKey(label);
  }, [updateDurationFields]);

  const handleTitleChange = useCallback((text) => {
    setNewChallenge((prev) => ({ ...prev, title: text }));
  }, [setNewChallenge]);

  const handleDescriptionChange = useCallback((text) => {
    setNewChallenge((prev) => ({ ...prev, description: text }));
  }, [setNewChallenge]);

  return (
    <Modal animationType="none" transparent={true} visible={isVisible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
        <Animated.View
          style={[
            twrnc`bg-[#121826] rounded-t-3xl p-6 h-4/5`,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={twrnc`flex-row justify-between items-center mb-6`}>
            <View style={twrnc`flex-1`}>
              <CustomText weight="bold" style={twrnc`text-white text-2xl mb-1`}>
                Create Challenge
              </CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm`}>
                Build a new fitness challenge
              </CustomText>
            </View>
            <TouchableOpacity
              style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl ml-4`}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={10}
          >
            {/* Challenge Group Type */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                Challenge Type
              </CustomText>
              <View style={twrnc`flex-row flex-wrap justify-between`}>
                {CHALLENGE_GROUP_TYPES.map((groupType) => (
                  <GroupTypeButton
                    key={groupType.id}
                    groupType={groupType}
                    isSelected={newChallenge.groupType === groupType.id}
                    onPress={() => handleGroupTypeSelect(groupType.id)}
                  />
                ))}
              </View>
            </View>

            {/* Activity Type */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                Activity Type
              </CustomText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={twrnc`pb-2`}
                removeClippedSubviews={true}
              >
                {activities.map((activity) => (
                  <ActivityButton
                    key={activity.id}
                    activity={activity}
                    isSelected={newChallenge.type === activity.id}
                    onPress={() => handleActivitySelect(activity.id, activity.unit)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Invite Friends */}
            {friends?.length > 0 && (
              <View style={twrnc`mb-6`}>
                <CustomText weight="semibold" style={twrnc`text-white mb-2`}>
                  Invite {newChallenge.groupType === "duo" ? "a Friend" : "Friends"}
                </CustomText>

                {inviteError && (
                  <CustomText style={twrnc`text-[#EF476F] text-sm mb-2`}>
                    {inviteError}
                  </CustomText>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={twrnc`pb-2`}
                  removeClippedSubviews={true}
                >
                  {friends.map((friend) => (
                    <FriendButton
                      key={friend.id}
                      friend={friend}
                      isSelected={newChallenge.selectedFriendsForGroupChallenge?.some(
                        (f) => f.id === friend.id
                      )}
                      onPress={() => handleFriendSelect(friend.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Title */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                Challenge Title
              </CustomText>
              <TextInput
                style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base`}
                placeholder="Enter challenge title"
                placeholderTextColor="#6B7280"
                value={newChallenge.title}
                onChangeText={handleTitleChange}
              />
            </View>

            {/* Description */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                Description
              </CustomText>
              <TextInput
                style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl h-20 text-base`}
                placeholder="Enter challenge description"
                placeholderTextColor="#6B7280"
                multiline
                textAlignVertical="top"
                value={newChallenge.description}
                onChangeText={handleDescriptionChange}
              />
            </View>

            {/* Duration & Stake Preview */}
            <View style={twrnc`mb-6`}>
              <CustomText weight="semibold" style={twrnc`text-white mb-3 text-lg`}>
                Duration
              </CustomText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={twrnc`pb-2 gap-3 px-1`}
              >
                {durationOptions.map((option) => (
                  <TouchableOpacity
                    key={option.label}
                    style={twrnc`
        w-20 h-20 items-center justify-center p-3 rounded-2xl
        border-2 ${selectedDurationKey === option.label
                        ? 'border-[#4361EE] bg-[#1E2A5E] shadow-lg shadow-[#4361EE40]'
                        : 'border-[#3A3F4B] bg-[#2A2E3A] shadow-md shadow-black/20'
                      }
      `}
                    onPress={() => handleDurationSelect(option.minutes, option.label)}
                    activeOpacity={0.7}
                  >
                    <CustomText
                      weight="bold"
                      style={twrnc`
          text-lg mb-1
          ${selectedDurationKey === option.label ? 'text-[#4361EE]' : 'text-white'}
        `}
                    >
                      {option.label}
                    </CustomText>

                    {selectedDurationKey === option.label && (
                      <View style={twrnc`absolute -top-1 -right-1 bg-[#4361EE] rounded-full w-5 h-5 items-center justify-center`}>
                        <Ionicons name="checkmark" size={12} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* XP Stake & Prize Pool Preview */}
              <View style={twrnc`bg-gradient-to-b from-[#1A1F2E] to-[#151925] rounded-2xl p-5 mt-4 border border-[#2A3245] shadow-lg`}>
                <CustomText weight="semibold" style={twrnc`text-white text-base mb-4 text-center`}>
                  Challenge Summary
                </CustomText>

                {/* Participants Row */}
                <View style={twrnc`flex-row justify-between items-center mb-4 pb-3 border-b border-[#2A3245]`}>
                  <View style={twrnc`flex-row items-center`}>
                    <View style={twrnc`bg-[#2A3245] p-2 rounded-lg mr-3`}>
                      <Ionicons name="people-outline" size={18} color="#FFC107" />
                    </View>
                    <View>
                      <CustomText style={twrnc`text-gray-300 text-sm`}>
                        Participants
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs`}>
                        Including you
                      </CustomText>
                    </View>
                  </View>
                  <View style={twrnc`bg-[#2A3245] px-3 py-1 rounded-full`}>
                    <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                      {getParticipantCount()} {getParticipantCount() === 1 ? 'person' : 'people'}
                    </CustomText>
                  </View>
                </View>

                {/* Stake & Prize Grid */}
                <View style={twrnc`flex-row justify-between`}>
                  {/* Your Stake */}
                  <View style={twrnc`flex-1 mr-2`}>
                    <View style={twrnc`flex-row items-center mb-2`}>
                      <View style={twrnc`bg-[#2A3245] p-1.5 rounded-lg mr-2`}>
                        <Ionicons name="shield-outline" size={14} color="#FFC107" />
                      </View>
                      <CustomText style={twrnc`text-gray-300 text-xs`}>
                        Your Stake
                      </CustomText>
                    </View>
                    <View style={twrnc`bg-[#2A3245] p-3 rounded-xl border-l-4 border-l-[#FFC107]`}>
                      <CustomText weight="bold" style={twrnc`text-[#FFC107] text-lg text-center`}>
                        {calculateStakeXP().toLocaleString()}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs text-center mt-1`}>
                        XP
                      </CustomText>
                    </View>
                  </View>

                  {/* Prize Pool */}
                  <View style={twrnc`flex-1 ml-2`}>
                    <View style={twrnc`flex-row items-center mb-2`}>
                      <View style={twrnc`bg-[#2A3245] p-1.5 rounded-lg mr-2`}>
                        <Ionicons name="trophy-outline" size={14} color="#4361EE" />
                      </View>
                      <CustomText style={twrnc`text-gray-300 text-xs`}>
                        Prize Pool
                      </CustomText>
                    </View>
                    <View style={twrnc`bg-[#2A3245] p-3 rounded-xl border-l-4 border-l-[#4361EE] relative`}>
                      <CustomText weight="bold" style={twrnc`text-[#4361EE] text-lg text-center`}>
                        {calculatePrizePool().toLocaleString()}
                      </CustomText>
                      <CustomText style={twrnc`text-gray-400 text-xs text-center mt-1`}>
                        XP
                      </CustomText>
                      <View style={twrnc`absolute -top-1 -right-1 bg-[#FFD700] rounded-full p-1`}>
                        <Ionicons name="trophy" size={10} color="#000" />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Multiplier Indicator */}
                <View style={twrnc`bg-[#2A3245] rounded-xl px-4 py-3 mt-4 border border-[#3A3F4B]`}>
                  <View style={twrnc`flex-row justify-between items-center`}>
                    <CustomText style={twrnc`text-gray-300 text-xs`}>
                      Calculation
                    </CustomText>
                    <View style={twrnc`bg-[#4361EE] px-2 py-1 rounded-full`}>
                      <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                        {getParticipantCount()} × {calculateStakeXP()} XP
                      </CustomText>
                    </View>
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-xs mt-1 text-center`}>
                    Each participant contributes {calculateStakeXP()} XP to the prize pool
                  </CustomText>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={twrnc`flex-row justify-between mb-4`}>
              <TouchableOpacity
                style={twrnc`bg-[#EF476F] py-4 px-6 rounded-2xl flex-1 mr-2 items-center`}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <CustomText weight="semibold" style={twrnc`text-white`}>
                  Cancel
                </CustomText>
              </TouchableOpacity>
              <TouchableOpacity
                style={twrnc`${creatingChallenge ? "bg-[#3251DD]" : "bg-[#4361EE]"
                  } py-4 px-6 rounded-2xl flex-1 ml-2 items-center ${!newChallenge.title.trim() && !creatingChallenge ? "opacity-50" : ""
                  }`}
                onPress={handleCreateChallenge}
                disabled={creatingChallenge || !newChallenge.title.trim()}
                activeOpacity={0.7}
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
                    Create Challenge
                  </CustomText>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default CreateChallengeModal;
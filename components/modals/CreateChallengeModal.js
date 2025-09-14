import React, { useState } from 'react';
import { Modal, View, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AnimatedButton from '../buttons/AnimatedButton';
import CustomText from '../CustomText';
import twrnc from 'twrnc';

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

const CreateChallengeModal = ({
    isVisible,
    onClose,
    newChallenge,
    setNewChallenge,
    friends,
    activities,
    CHALLENGE_GROUP_TYPES,
    DIFFICULTY_LEVELS,
    handleCreateChallenge,
    creatingChallenge,
    showModal,
    DEFAULT_AVATAR,
}) => {
    const [showDateTimePicker, setShowDateTimePicker] = useState(false);

    // Calculate duration fields from endDate
    const updateDurationFields = (selectedDate) => {
        const now = Date.now();
        const endDate = selectedDate.getTime();
        const diffMilliseconds = Math.max(0, endDate - now);

        const durationDays = Math.floor(diffMilliseconds / (24 * 60 * 60 * 1000));
        const remainingAfterDays = diffMilliseconds % (24 * 60 * 60 * 1000);
        const durationHours = Math.floor(remainingAfterDays / (60 * 60 * 1000));
        const remainingAfterHours = remainingAfterDays % (60 * 60 * 1000);
        const durationMinutes = Math.floor(remainingAfterHours / (60 * 1000));
        const durationSeconds = Math.floor((remainingAfterHours % (60 * 1000)) / 1000);

        setNewChallenge((prev) => ({
            ...prev,
            endDate: selectedDate,
            durationDays,
            durationHours,
            durationMinutes,
            durationSeconds,
        }));
    };

    // ✅ Open DateTimePicker (Android dialog)
    const openDateTimePicker = () => {
        DateTimePickerAndroid.open({
            value: newChallenge.endDate || new Date(),
            mode: 'datetime',
            display: 'default',
            minimumDate: new Date(Date.now() + 60 * 1000),
            onChange: (event, selectedDate) => {
                if (event.type === 'dismissed') return;
                if (selectedDate) {
                    updateDurationFields(selectedDate);
                }
            },
        });
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose}
        >
            <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
                <View style={twrnc`bg-[#121826] rounded-t-3xl p-6 h-4/5`}>
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
                        <AnimatedButton
                            style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl ml-4`}
                            onPress={onClose}
                            activeOpacity={0.8}
                            accessibilityLabel="Close create challenge modal"
                        >
                            <Ionicons name="close" size={20} color="#FFFFFF" />
                        </AnimatedButton>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Challenge Group Type Selection */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Challenge Type
                            </CustomText>
                            <View style={twrnc`flex-row flex-wrap justify-between`}>
                                {CHALLENGE_GROUP_TYPES.map((groupType) => (
                                    <AnimatedButton
                                        key={groupType.id}
                                        style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center min-w-[100px] ${newChallenge.groupType === groupType.id
                                            ? 'border-2 border-[#FFC107]'
                                            : 'bg-[#2A2E3A]'
                                            }`}
                                        onPress={() =>
                                            setNewChallenge({
                                                ...newChallenge,
                                                groupType: groupType.id,
                                                selectedFriendsForGroupChallenge: [],
                                            })
                                        }
                                        activeOpacity={0.8}
                                        accessibilityLabel={`Select ${groupType.name} challenge type`}
                                    >
                                        <CustomText
                                            weight={newChallenge.groupType === groupType.id ? 'bold' : 'medium'}
                                            style={twrnc`text-white text-center text-sm`}
                                        >
                                            {groupType.name}
                                        </CustomText>
                                    </AnimatedButton>
                                ))}
                            </View>
                            {newChallenge.groupType !== 'public' && (
                                <CustomText style={twrnc`text-gray-400 text-sm mt-2 text-center`}>
                                    {CHALLENGE_GROUP_TYPES.find((t) => t.id === newChallenge.groupType)?.description}
                                </CustomText>
                            )}
                        </View>

                        {/* Friend Selection */}
                        {(newChallenge.groupType === 'duo' || newChallenge.groupType === 'lobby') && (
                            <View style={twrnc`mb-6`}>
                                <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                    Select Friends (
                                    {newChallenge.selectedFriendsForGroupChallenge.length} /{' '}
                                    {newChallenge.groupType === 'duo'
                                        ? 1
                                        : CHALLENGE_GROUP_TYPES.find((t) => t.id === 'lobby').maxParticipants - 1}
                                    )
                                </CustomText>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
                                    {friends.map((friend) => {
                                        const isSelected = newChallenge.selectedFriendsForGroupChallenge.some(
                                            (f) => f.id === friend.id
                                        );
                                        const maxFriendsReached =
                                            newChallenge.groupType === 'duo'
                                                ? newChallenge.selectedFriendsForGroupChallenge.length >= 1
                                                : newChallenge.selectedFriendsForGroupChallenge.length >=
                                                CHALLENGE_GROUP_TYPES.find((t) => t.id === 'lobby').maxParticipants - 1;

                                        return (
                                            <AnimatedButton
                                                key={friend.id || friend.uid}
                                                style={twrnc`mx-2 items-center ${isSelected ? 'border-2 border-[#06D6A0] rounded-2xl p-1' : ''
                                                    }`}
                                                onPress={() => {
                                                    setNewChallenge((prev) => {
                                                        const currentSelected = [...prev.selectedFriendsForGroupChallenge];
                                                        if (isSelected) {
                                                            return {
                                                                ...prev,
                                                                selectedFriendsForGroupChallenge: currentSelected.filter(
                                                                    (f) => f.id !== friend.id
                                                                ),
                                                            };
                                                        } else if (maxFriendsReached) {
                                                            showModal({
                                                                title: 'Limit Reached',
                                                                message:
                                                                    newChallenge.groupType === 'duo'
                                                                        ? 'You can only select one friend for a duo challenge.'
                                                                        : `You can only select up to ${CHALLENGE_GROUP_TYPES.find((t) => t.id === 'lobby')
                                                                            .maxParticipants - 1
                                                                        } friends for a lobby challenge.`,
                                                                type: 'info',
                                                            });
                                                            return prev;
                                                        }
                                                        return {
                                                            ...prev,
                                                            selectedFriendsForGroupChallenge:
                                                                newChallenge.groupType === 'duo'
                                                                    ? [friend]
                                                                    : [...currentSelected, friend],
                                                        };
                                                    });
                                                }}
                                                activeOpacity={0.8}
                                                accessibilityLabel={`Select friend ${friend.displayName || friend.username}`}
                                            >
                                                <Image
                                                    source={{ uri: friend.avatar || DEFAULT_AVATAR }}
                                                    style={twrnc`w-12 h-12 rounded-2xl`}
                                                />
                                                <CustomText style={twrnc`text-white text-xs mt-1 text-center`}>
                                                    {friend.displayName || friend.username}
                                                </CustomText>
                                            </AnimatedButton>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}

                        {/* Activity Type Selection */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Activity Type
                            </CustomText>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twrnc`-mx-2`}>
                                {activities.map((activity) => (
                                    <AnimatedButton
                                        key={activity.id}
                                        style={twrnc`mx-2 p-4 rounded-2xl items-center min-w-[100px] ${newChallenge.type === activity.id
                                            ? `border-2 border-[${activity.color}]`
                                            : 'bg-[#2A2E3A]'
                                            }`}
                                        onPress={() =>
                                            setNewChallenge({
                                                ...newChallenge,
                                                type: activity.id,
                                                goal: activity.defaultGoal,
                                                unit: activity.unit,
                                            })
                                        }
                                        activeOpacity={0.8}
                                        accessibilityLabel={`Select ${activity.name} activity`}
                                    >
                                        <View
                                            style={[
                                                twrnc`w-12 h-12 rounded-2xl items-center justify-center mb-2`,
                                                {
                                                    backgroundColor:
                                                        newChallenge.type === activity.id ? activity.color : '#3A3F4B',
                                                },
                                            ]}
                                        >
                                            <Image
                                                source={activity.icon}
                                                style={twrnc`w-6 h-6 tint-[${newChallenge.type === activity.id ? '#FFFFFF' : '#6B7280'
                                                    }]`}
                                                resizeMode="contain"
                                            />
                                        </View>
                                        <CustomText
                                            weight={newChallenge.type === activity.id ? 'bold' : 'medium'}
                                            style={twrnc`text-white text-center text-sm`}
                                        >
                                            {activity.name}
                                        </CustomText>
                                    </AnimatedButton>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Goal Selection */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Challenge Goal
                            </CustomText>
                            <View style={twrnc`flex-row items-center bg-[#2A2E3A] rounded-2xl px-4 py-3 mb-3`}>
                                <TextInput
                                    style={twrnc`flex-1 text-white text-lg font-bold`}
                                    value={String(newChallenge.goal)}
                                    onChangeText={(text) => setNewChallenge({ ...newChallenge, goal: Number(text) || 0 })}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor="#6B7280"
                                    accessibilityLabel="Challenge goal input"
                                />
                                <CustomText style={twrnc`text-gray-400 ml-2`}>{newChallenge.unit}</CustomText>
                            </View>
                            <View style={twrnc`flex-row flex-wrap`}>
                                {activities
                                    .find((act) => act.id === newChallenge.type)
                                    ?.goalOptions?.map((option) => (
                                        <AnimatedButton
                                            key={option}
                                            style={twrnc`bg-[#3A3F4B] px-4 py-2 rounded-xl mr-2 mb-2 ${newChallenge.goal === option ? 'bg-[#4361EE]' : ''
                                                }`}
                                            onPress={() => setNewChallenge({ ...newChallenge, goal: option })}
                                            activeOpacity={0.8}
                                            accessibilityLabel={`Set goal to ${option} ${newChallenge.unit}`}
                                        >
                                            <CustomText
                                                weight={newChallenge.goal === option ? 'bold' : 'medium'}
                                                style={twrnc`text-white text-sm`}
                                            >
                                                {option} {newChallenge.unit}
                                            </CustomText>
                                        </AnimatedButton>
                                    ))}
                            </View>
                        </View>

                        {/* Difficulty Selection */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Difficulty Level
                            </CustomText>
                            <View style={twrnc`flex-row justify-between`}>
                                {DIFFICULTY_LEVELS.map((difficulty) => (
                                    <AnimatedButton
                                        key={difficulty.id}
                                        style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center ${newChallenge.difficulty === difficulty.id
                                            ? `border-2 border-[${difficulty.color}]`
                                            : 'bg-[#2A2E3A]'
                                            }`}
                                        onPress={() => setNewChallenge({ ...newChallenge, difficulty: difficulty.id })}
                                        activeOpacity={0.8}
                                        accessibilityLabel={`Select ${difficulty.name} difficulty`}
                                    >
                                        <View
                                            style={[
                                                twrnc`w-10 h-10 rounded-2xl items-center justify-center mb-2`,
                                                {
                                                    backgroundColor:
                                                        newChallenge.difficulty === difficulty.id ? difficulty.color : '#3A3F4B',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={difficulty.icon}
                                                size={20}
                                                color={newChallenge.difficulty === difficulty.id ? '#FFFFFF' : '#6B7280'}
                                            />
                                        </View>
                                        <CustomText
                                            weight={newChallenge.difficulty === difficulty.id ? 'bold' : 'medium'}
                                            style={twrnc`text-white text-center text-xs`}
                                        >
                                            {difficulty.name}
                                        </CustomText>
                                        <CustomText style={twrnc`text-gray-400 text-xs mt-1`}>
                                            {difficulty.multiplier}x
                                        </CustomText>
                                    </AnimatedButton>
                                ))}
                            </View>s
                        </View>

                        {/* Duration Selection */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Duration
                            </CustomText>

                            {/* Quick Duration Buttons */}
                            <View style={twrnc`flex-row flex-wrap mb-3`}>
                                {[{ label: "30m", minutes: 30 }, { label: "1h", minutes: 60 }, { label: "1d", minutes: 1440 }].map(
                                    (option) => (
                                        <AnimatedButton
                                            key={option.label}
                                            style={twrnc`bg-[#3A3F4B] px-4 py-2 rounded-xl mr-2 mb-2`}
                                            onPress={() => {
                                                const selectedDate = new Date(Date.now() + option.minutes * 60 * 1000);
                                                updateDurationFields(selectedDate);
                                            }}
                                            activeOpacity={0.8}
                                            accessibilityLabel={`Set duration to ${option.label}`}
                                        >
                                            <CustomText style={twrnc`text-white text-sm`}>{option.label}</CustomText>
                                        </AnimatedButton>
                                    )
                                )}
                            </View>

                            {/* Manual Picker */}
                            <AnimatedButton
                                style={twrnc`bg-[#2A2E3A] p-4 rounded-2xl items-center`}
                                onPress={openDateTimePicker} // Opens the system picker
                                activeOpacity={0.8}
                                accessibilityLabel="Open date and time picker"
                            >
                                <CustomText weight="medium" style={twrnc`text-white text-base`}>
                                    {newChallenge.endDate
                                        ? `Ends: ${newChallenge.endDate.toLocaleString()}`
                                        : 'Select End Date & Time'}
                                </CustomText>
                            </AnimatedButton>

                            {/* Display breakdown */}
                            <View style={twrnc`flex-row justify-between mt-3`}>
                                <CustomText style={twrnc`text-gray-400 text-sm`}>
                                    Days: {newChallenge.durationDays}
                                </CustomText>
                                <CustomText style={twrnc`text-gray-400 text-sm`}>
                                    Hours: {newChallenge.durationHours}
                                </CustomText>
                                <CustomText style={twrnc`text-gray-400 text-sm`}>
                                    Minutes: {newChallenge.durationMinutes}
                                </CustomText>
                                <CustomText style={twrnc`text-gray-400 text-sm`}>
                                    Seconds: {newChallenge.durationSeconds}
                                </CustomText>
                            </View>
                        </View>


                        {/* Challenge Title */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Challenge Title
                            </CustomText>
                            <TextInput
                                style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base`}
                                placeholder="Enter challenge title"
                                placeholderTextColor="#6B7280"
                                value={newChallenge.title}
                                onChangeText={(text) => setNewChallenge({ ...newChallenge, title: text })}
                                accessibilityLabel="Challenge title input"
                            />
                        </View>

                        {/* Challenge Description */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Description
                            </CustomText>
                            <TextInput
                                style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl h-20 text-base`}
                                placeholder="Enter challenge description"
                                placeholderTextColor="#6B7280"
                                multiline={true}
                                textAlignVertical="top"
                                value={newChallenge.description}
                                onChangeText={(text) => setNewChallenge({ ...newChallenge, description: text })}
                                accessibilityLabel="Challenge description input"
                            />
                        </View>

                        {/* XP Reward/Penalty Settings */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                XP Settings
                            </CustomText>
                            <View style={twrnc`flex-row justify-between`}>
                                <View style={twrnc`flex-1 mr-2`}>
                                    <CustomText style={twrnc`text-gray-400 text-sm mb-1`}>XP Reward</CustomText>
                                    <TextInput
                                        style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base text-center`}
                                        placeholder="50"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={String(newChallenge.xpReward)}
                                        onChangeText={(text) =>
                                            setNewChallenge({
                                                ...newChallenge,
                                                xpReward: Math.max(0, Number(text) || 0),
                                            })
                                        }
                                        accessibilityLabel="XP reward input"
                                    />
                                </View>
                                <View style={twrnc`flex-1 ml-2`}>
                                    <CustomText style={twrnc`text-gray-400 text-sm mb-1`}>XP Penalty</CustomText>
                                    <TextInput
                                        style={twrnc`bg-[#2A2E3A] text-white p-4 rounded-2xl text-base text-center`}
                                        placeholder="10"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="numeric"
                                        value={String(newChallenge.xpPenalty)}
                                        onChangeText={(text) =>
                                            setNewChallenge({
                                                ...newChallenge,
                                                xpPenalty: Math.max(0, Number(text) || 0),
                                            })
                                        }
                                        accessibilityLabel="XP penalty input"
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Completion Requirement */}
                        <View style={twrnc`mb-8`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Completion Requirement
                            </CustomText>
                            <View style={twrnc`flex-row justify-between`}>
                                {[
                                    { id: 'complete_goal', name: 'Reach Goal', icon: 'flag-outline', color: '#06D6A0' },
                                    { id: 'better_than_others', name: 'Beat Others', icon: 'trophy-outline', color: '#FFC107' },
                                    { id: 'time_based', name: 'Time Based', icon: 'time-outline', color: '#4361EE' },
                                ].map((requirement) => (
                                    <AnimatedButton
                                        key={requirement.id}
                                        style={twrnc`flex-1 mx-1 p-4 rounded-2xl items-center ${newChallenge.completionRequirement === requirement.id
                                            ? `border-2 border-[${requirement.color}]`
                                            : 'bg-[#2A2E3A]'
                                            }`}
                                        onPress={() =>
                                            setNewChallenge({
                                                ...newChallenge,
                                                completionRequirement: requirement.id,
                                            })
                                        }
                                        activeOpacity={0.8}
                                        accessibilityLabel={`Select ${requirement.name} completion requirement`}
                                    >
                                        <View
                                            style={[
                                                twrnc`w-10 h-10 rounded-2xl items-center justify-center mb-2`,
                                                {
                                                    backgroundColor:
                                                        newChallenge.completionRequirement === requirement.id
                                                            ? requirement.color
                                                            : '#3A3F4B',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={requirement.icon}
                                                size={20}
                                                color={
                                                    newChallenge.completionRequirement === requirement.id ? '#FFFFFF' : '#6B7280'
                                                }
                                            />
                                        </View>
                                        <CustomText
                                            weight={newChallenge.completionRequirement === requirement.id ? 'bold' : 'medium'}
                                            style={twrnc`text-white text-center text-xs`}
                                        >
                                            {requirement.name}
                                        </CustomText>
                                    </AnimatedButton>
                                ))}
                            </View>
                        </View>

                        {/* Challenge Preview */}
                        <View style={twrnc`mb-8 bg-[#2A2E3A] rounded-2xl p-4`}>
                            <CustomText weight="semibold" style={twrnc`text-white mb-3`}>
                                Challenge Preview
                            </CustomText>
                            <View style={twrnc`flex-row items-center mb-2`}>
                                <View
                                    style={[
                                        twrnc`w-8 h-8 rounded-xl items-center justify-center mr-3`,
                                        {
                                            backgroundColor:
                                                activities.find((a) => a.id === newChallenge.type)?.color || '#4361EE',
                                        },
                                    ]}
                                >
                                    <Image
                                        source={activities.find((a) => a.id === newChallenge.type)?.icon}
                                        style={twrnc`w-4 h-4 tint-[#FFFFFF]`}
                                        resizeMode="contain"
                                    />
                                </View>
                                <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                                    {newChallenge.title || 'New Challenge'}
                                </CustomText>
                            </View>
                            <CustomText style={twrnc`text-gray-400 text-sm mb-3`}>
                                {newChallenge.description || 'No description provided'}
                            </CustomText>
                            <View style={twrnc`flex-row justify-between`}>
                                <View style={twrnc`items-center`}>
                                    <CustomText weight="semibold" style={twrnc`text-[#4361EE] text-lg`}>
                                        {newChallenge.goal}
                                    </CustomText>
                                    <CustomText style={twrnc`text-gray-400 text-xs`}>{newChallenge.unit}</CustomText>
                                </View>
                                <View style={twrnc`items-center`}>
                                    <CustomText weight="semibold" style={twrnc`text-[#FFC107] text-lg`}>
                                        {newChallenge.durationDays}
                                    </CustomText>
                                    <CustomText style={twrnc`text-gray-400 text-xs`}>days</CustomText>
                                </View>
                                <View style={twrnc`items-center`}>
                                    <CustomText
                                        weight="semibold"
                                        style={twrnc`text-[#EF476F] text-lg capitalize`}
                                    >
                                        {newChallenge.difficulty}
                                    </CustomText>
                                    <CustomText style={twrnc`text-gray-400 text-xs`}>difficulty</CustomText>
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        <View style={twrnc`flex-row justify-between mb-4`}>
                            <AnimatedButton
                                style={twrnc`bg-[#EF476F] py-4 px-6 rounded-2xl flex-1 mr-2 items-center`}
                                onPress={onClose}
                                activeOpacity={0.8}
                                accessibilityLabel="Cancel challenge creation"
                            >
                                <CustomText weight="semibold" style={twrnc`text-white`}>
                                    Cancel
                                </CustomText>
                            </AnimatedButton>
                            <AnimatedButton
                                style={twrnc`${creatingChallenge ? 'bg-[#3251DD]' : 'bg-[#4361EE]'
                                    } py-4 px-6 rounded-2xl flex-1 ml-2 items-center ${!newChallenge.title.trim() ? 'opacity-50' : ''
                                    }`}
                                onPress={handleCreateChallenge}
                                disabled={creatingChallenge || !newChallenge.title.trim()}
                                activeOpacity={0.8}
                                accessibilityLabel="Create challenge"
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
                            </AnimatedButton>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

export default CreateChallengeModal;
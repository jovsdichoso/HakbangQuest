import { Modal, View, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image } from 'react-native';
import twrnc from 'twrnc';
import { CustomText } from '../CustomText';
import Ionicons from '@expo/vector-icons/Ionicons';

const EditChallengeModal = ({
    isVisible,
    onClose,
    selectedChallenge,
    newChallenge,
    setNewChallenge,
    activities,
    CHALLENGE_GROUP_TYPES,
    creatingChallenge,
    onSaveChanges,
}) => {
    // Get activity data
    const activityData = activities.find((a) => a.id === newChallenge.type);
    const activityColor = activityData?.color || '#FFC107';
    const activityIcon = activityData?.icon;

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
                {/* Modal Container */}
                <View style={[twrnc`bg-[#1F2937] rounded-t-3xl p-5`, { maxHeight: '90%' }]}>
                    {/* Header with Colorful Strip */}
                    <View style={[twrnc`h-1 mb-4 rounded-full overflow-hidden`, { backgroundColor: activityColor }]}>
                        <View style={twrnc`h-full flex-row`}>
                            {[...Array(20)].map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        twrnc`flex-1`,
                                        { backgroundColor: i % 2 === 0 ? activityColor : `${activityColor}CC` },
                                    ]}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={twrnc`flex-row justify-between items-center mb-4`}>
                        <CustomText weight="bold" style={twrnc`text-white text-2xl flex-1`}>
                            Edit Challenge
                        </CustomText>
                        <TouchableOpacity
                            style={[twrnc`p-2.5 rounded-xl`, { backgroundColor: `${activityColor}20` }]}
                            onPress={onClose}
                            disabled={creatingChallenge}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="close" size={20} color={activityColor} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Activity Icon */}
                        <View style={twrnc`mb-4 self-center`}>
                            <View
                                style={[
                                    twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                                    { backgroundColor: activityColor, transform: [{ rotate: '5deg' }] },
                                ]}
                            >
                                {activityIcon ? (
                                    <Image source={activityIcon} style={twrnc`w-12 h-12`} resizeMode="contain" tintColor="#FFFFFF" />
                                ) : (
                                    <View style={twrnc`items-center`}>
                                        <Ionicons name="fitness" size={36} color="#FFFFFF" />
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Summary Cards */}
                        <View style={twrnc`flex-row justify-between mb-5 -mx-1`}>
                            {/* Challenge Type */}
                            <View
                                style={[twrnc`rounded-xl px-3 py-3 flex-1 mx-1`, { backgroundColor: `${activityColor}15` }]}
                            >
                                <CustomText style={[twrnc`text-[9px] uppercase mb-1`, { color: activityColor }]}>
                                    Type
                                </CustomText>
                                <CustomText weight="bold" style={[twrnc`text-sm`, { color: activityColor }]}>
                                    {CHALLENGE_GROUP_TYPES.find((t) => t.id === newChallenge.groupType)?.name || 'Public'}
                                </CustomText>
                            </View>

                            {/* Duration */}
                            <View style={twrnc`bg-[#34D399] rounded-xl px-3 py-3 flex-1 mx-1`}>
                                <CustomText style={twrnc`text-[#064E3B] text-[9px] uppercase mb-1`}>Duration</CustomText>
                                <CustomText weight="bold" style={twrnc`text-[#064E3B] text-sm`}>
                                    {newChallenge.durationMinutes}m
                                </CustomText>
                            </View>

                            {/* Stake */}
                            <View style={twrnc`bg-[#A855F7] rounded-xl px-3 py-3 flex-1 mx-1`}>
                                <CustomText style={twrnc`text-white text-[9px] uppercase mb-1`}>Stake</CustomText>
                                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                                    {newChallenge.individualStake || Math.round(newChallenge.stakeXP / (selectedChallenge?.maxParticipants || 2))} XP
                                </CustomText>
                            </View>
                        </View>

                        {/* Editable Fields Section */}
                        <View style={[twrnc`mb-4 p-3 rounded-xl bg-[#111827] border-l-4`, { borderLeftColor: activityColor }]}>

                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-1`}>
                                Editable Details
                            </CustomText>
                            <CustomText style={twrnc`text-gray-400 text-xs leading-5`}>
                                You can update the title and description below
                            </CustomText>
                        </View>

                        {/* Challenge Title - EDITABLE */}
                        <View style={twrnc`mb-4`}>
                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                                Challenge Title
                            </CustomText>
                            <TextInput
                                style={[
                                    twrnc`text-white p-4 rounded-xl text-base border-2`,
                                    {
                                        backgroundColor: '#1F2937',
                                        borderColor: activityColor,
                                    }
                                ]}
                                placeholder="Enter challenge title"
                                placeholderTextColor="#6B7280"
                                value={newChallenge.title}
                                onChangeText={(text) => setNewChallenge({ ...newChallenge, title: text })}
                                editable={!creatingChallenge}
                            />
                        </View>

                        {/* Description - EDITABLE */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                                Description
                            </CustomText>
                            <TextInput
                                style={[
                                    twrnc`text-white p-4 rounded-xl text-base border-2`,
                                    {
                                        backgroundColor: '#1F2937',
                                        borderColor: activityColor,
                                        minHeight: 100
                                    }
                                ]}
                                placeholder="Enter challenge description"
                                placeholderTextColor="#6B7280"
                                multiline={true}
                                textAlignVertical="top"
                                value={newChallenge.description}
                                onChangeText={(text) => setNewChallenge({ ...newChallenge, description: text })}
                                editable={!creatingChallenge}
                            />
                        </View>

                        {/* Locked Fields Section */}
                        <View style={twrnc`mb-4 p-3 rounded-xl bg-[#111827] border-l-4 border-l-[#6B7280]`}>
                            <View style={twrnc`flex-row items-center`}>
                                <Ionicons name="lock-closed" size={14} color="#9CA3AF" style={twrnc`mr-2`} />
                                <CustomText weight="semibold" style={twrnc`text-gray-400 text-sm`}>
                                    Locked Details
                                </CustomText>
                            </View>
                            <CustomText style={twrnc`text-gray-500 text-xs mt-1`}>
                                These cannot be changed after challenge creation
                            </CustomText>
                        </View>

                        {/* Activity Type - LOCKED */}
                        <View style={twrnc`mb-4`}>
                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                                Activity Type
                            </CustomText>
                            <View style={twrnc`bg-[#111827] p-4 rounded-xl border-2 border-[#374151] opacity-60`}>
                                <CustomText style={twrnc`text-gray-400 text-center`}>
                                    {activityData?.name || 'Walking'}
                                </CustomText>
                            </View>
                        </View>

                        {/* End Date - LOCKED */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                                End Date
                            </CustomText>
                            <View style={twrnc`bg-[#111827] p-4 rounded-xl border-2 border-[#374151] opacity-60`}>
                                <CustomText style={twrnc`text-gray-400 text-center`}>
                                    {newChallenge.endDate?.toLocaleDateString?.() || 'Not Set'}
                                </CustomText>
                            </View>
                        </View>
                    </ScrollView>

                    {/* Action Buttons */}
                    <View style={twrnc`flex-row justify-between mb-4 mt-6`}>
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
                            style={[
                                twrnc`py-4 px-6 rounded-2xl flex-1 ml-2 items-center`,
                                { backgroundColor: creatingChallenge ? '#064E3B' : '#10B981' },
                            ]}
                            onPress={onSaveChanges}
                            disabled={creatingChallenge}
                            activeOpacity={0.7}
                        >
                            {creatingChallenge ? (
                                <View style={twrnc`flex-row items-center`}>
                                    <ActivityIndicator size="small" color="white" style={twrnc`mr-2`} />
                                    <CustomText weight="semibold" style={twrnc`text-white`}>
                                        Saving...
                                    </CustomText>
                                </View>
                            ) : (
                                <View style={twrnc`flex-row items-center`}>
                                    <Ionicons name="checkmark" size={20} color="#FFFFFF" style={twrnc`mr-2`} />
                                    <CustomText weight="semibold" style={twrnc`text-white`}>
                                        Save Changes
                                    </CustomText>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default EditChallengeModal;

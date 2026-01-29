// components/WorkoutCompleteModal.js - MINIMAL CLEAN VERSION
import React, { useEffect, useRef } from 'react';
import { View, Modal, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from 'twrnc';
import CustomText from './CustomText';

const WorkoutCompleteModal = ({ 
  visible, 
  onClose, 
  activityName = 'Workout',
  stats = {},
  xpEarned = 0,
  questCompleted = false,
  questTitle = '',
  challengeCompleted = false,
  levelUp = false,
  newLevel = 1,
  isStrength = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 65,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const getActivityColor = () => {
    if (questCompleted) return '#06D6A0';
    if (challengeCompleted) return '#FFC107';
    if (isStrength) return '#9B5DE5';
    return '#4361EE';
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activityColor = getActivityColor();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={tw`flex-1 bg-black/85 justify-center items-center px-6`}>
        <Animated.View
          style={[
            tw`w-full rounded-2xl overflow-hidden`,
            {
              backgroundColor: '#1e293b',
              maxWidth: 360,
              transform: [{ scale: scaleAnim }],
              opacity: fadeAnim,
            },
          ]}
        >
          {/* Header */}
          <View style={tw`px-6 pt-6 pb-4`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <View style={tw`flex-1`}>
                <CustomText weight="bold" style={tw`text-white text-xl mb-1`}>
                  {questCompleted ? 'Quest Complete' : 
                   challengeCompleted ? 'Challenge Complete' :
                   levelUp ? 'Level Up' :
                   'Workout Complete'}
                </CustomText>
                <CustomText style={tw`text-gray-400 text-sm capitalize`}>
                  {questCompleted ? questTitle : activityName}
                </CustomText>
              </View>
              
              <View style={[tw`rounded-full p-3`, { backgroundColor: activityColor + '20' }]}>
                <Ionicons 
                  name={questCompleted ? 'trophy' : isStrength ? 'barbell' : 'flash'} 
                  size={24} 
                  color={activityColor} 
                />
              </View>
            </View>

            {/* Level Up Badge */}
            {levelUp && (
              <View style={tw`bg-FFC107 bg-opacity-15 rounded-lg px-3 py-2 flex-row items-center`}>
                <Ionicons name="arrow-up-circle" size={18} color="#FFC107" style={tw`mr-2`} />
                <CustomText weight="semibold" style={tw`text-FFC107 text-sm`}>
                  Reached Level {newLevel}
                </CustomText>
              </View>
            )}
          </View>

          {/* XP Section */}
          {xpEarned > 0 && (
            <View style={[tw`mx-6 mb-4 rounded-xl p-4 items-center`, { backgroundColor: activityColor + '15' }]}>
              <CustomText style={tw`text-gray-300 text-xs mb-1`}>XP Earned</CustomText>
              <View style={tw`flex-row items-center`}>
                <Ionicons name="star" size={28} color={activityColor} style={tw`mr-2`} />
                <CustomText weight="bold" style={[tw`text-4xl`, { color: activityColor }]}>
                  {xpEarned}
                </CustomText>
              </View>
            </View>
          )}

          {/* Stats Grid */}
          <View style={tw`px-6 pb-5`}>
            <View style={tw`flex-row flex-wrap -mx-1.5`}>
              {/* Reps or Distance */}
              <View style={tw`w-1/2 px-1.5 mb-3`}>
                <View style={tw`bg-0f172a rounded-lg p-3`}>
                  <View style={tw`flex-row items-center mb-2`}>
                    <Ionicons 
                      name={isStrength ? 'fitness-outline' : 'navigate-outline'} 
                      size={16} 
                      color="#9CA3AF" 
                      style={tw`mr-1.5`}
                    />
                    <CustomText style={tw`text-gray-400 text-xs`}>
                      {isStrength ? 'Reps' : 'Distance'}
                    </CustomText>
                  </View>
                  <CustomText weight="bold" style={tw`text-white text-2xl`}>
                    {isStrength ? (stats.reps || 0) : ((stats.distance || 0) / 1000).toFixed(2)}
                  </CustomText>
                  {!isStrength && (
                    <CustomText style={tw`text-gray-500 text-xs mt-0.5`}>km</CustomText>
                  )}
                </View>
              </View>

              {/* Duration */}
              <View style={tw`w-1/2 px-1.5 mb-3`}>
                <View style={tw`bg-0f172a rounded-lg p-3`}>
                  <View style={tw`flex-row items-center mb-2`}>
                    <Ionicons name="time-outline" size={16} color="#9CA3AF" style={tw`mr-1.5`} />
                    <CustomText style={tw`text-gray-400 text-xs`}>Time</CustomText>
                  </View>
                  <CustomText weight="bold" style={tw`text-white text-2xl`}>
                    {formatDuration(stats.duration || 0)}
                  </CustomText>
                  <CustomText style={tw`text-gray-500 text-xs mt-0.5`}>min</CustomText>
                </View>
              </View>

              {/* Calories */}
              <View style={tw`w-1/2 px-1.5 mb-3`}>
                <View style={tw`bg-0f172a rounded-lg p-3`}>
                  <View style={tw`flex-row items-center mb-2`}>
                    <Ionicons name="flame-outline" size={16} color="#9CA3AF" style={tw`mr-1.5`} />
                    <CustomText style={tw`text-gray-400 text-xs`}>Calories</CustomText>
                  </View>
                  <CustomText weight="bold" style={tw`text-white text-2xl`}>
                    {stats.calories || 0}
                  </CustomText>
                  <CustomText style={tw`text-gray-500 text-xs mt-0.5`}>kcal</CustomText>
                </View>
              </View>

              {/* Steps (cardio only) */}
              {!isStrength && (
                <View style={tw`w-1/2 px-1.5 mb-3`}>
                  <View style={tw`bg-0f172a rounded-lg p-3`}>
                    <View style={tw`flex-row items-center mb-2`}>
                      <Ionicons name="walk-outline" size={16} color="#9CA3AF" style={tw`mr-1.5`} />
                      <CustomText style={tw`text-gray-400 text-xs`}>Steps</CustomText>
                    </View>
                    <CustomText weight="bold" style={tw`text-white text-2xl`}>
                      {((stats.steps || 0) / 1000).toFixed(1)}
                    </CustomText>
                    <CustomText style={tw`text-gray-500 text-xs mt-0.5`}>k</CustomText>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Action Button */}
          <View style={tw`px-6 pb-6`}>
            <TouchableOpacity
              style={[tw`rounded-xl py-4 items-center`, { backgroundColor: activityColor }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <CustomText weight="bold" style={tw`text-white text-base`}>
                Continue
              </CustomText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default WorkoutCompleteModal;

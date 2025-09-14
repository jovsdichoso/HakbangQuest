// components/BadgeComponents.js - UI components for badges
import React from 'react';
import { View, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import twrnc from 'twrnc';
import CustomText from './CustomText';
import { BADGE_COLORS } from '../screens/BadgeSystem';

const { width } = Dimensions.get('window');

// Individual Badge Component
export const BadgeItem = ({ badge, size = 'medium', onPress }) => {
  const sizeStyles = {
    small: { container: 'w-12 h-12', icon: 16, text: 'text-xs' },
    medium: { container: 'w-16 h-16', icon: 20, text: 'text-sm' },
    large: { container: 'w-20 h-20', icon: 24, text: 'text-base' }
  };
  
  const style = sizeStyles[size];
  const badgeColor = BADGE_COLORS[badge.rarity] || BADGE_COLORS.common;
  
  return (
    <TouchableOpacity
      style={[
        twrnc`${style.container} rounded-2xl items-center justify-center m-1`,
        { backgroundColor: badgeColor + '20', borderColor: badgeColor, borderWidth: 2 }
      ]}
      onPress={() => onPress && onPress(badge)}
      activeOpacity={0.8}
    >
      <Ionicons 
        name={badge.icon} 
        size={style.icon} 
        color={badgeColor}
      />
      {badge.isNew && (
        <View style={twrnc`absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full`} />
      )}
    </TouchableOpacity>
  );
};

// Badge Grid Component
export const BadgeGrid = ({ badges, onBadgePress, maxVisible = 6 }) => {
  const visibleBadges = badges.slice(0, maxVisible);
  const remainingCount = Math.max(0, badges.length - maxVisible);
  
  return (
    <View style={twrnc`flex-row flex-wrap justify-center`}>
      {visibleBadges.map((badge, index) => (
        <BadgeItem
          key={badge.id}
          badge={badge}
          size="medium"
          onPress={onBadgePress}
        />
      ))}
      {remainingCount > 0 && (
        <View style={twrnc`w-16 h-16 rounded-2xl bg-gray-600 items-center justify-center m-1`}>
          <CustomText style={twrnc`text-white text-sm font-bold`}>
            +{remainingCount}
          </CustomText>
        </View>
      )}
    </View>
  );
};

// Badge Details Modal
export const BadgeModal = ({ visible, badge, onClose }) => {
  if (!badge) return null;
  
  const badgeColor = BADGE_COLORS[badge.rarity] || BADGE_COLORS.common;
  
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={twrnc`flex-1 bg-black bg-opacity-70 justify-center items-center px-6`}>
        <View style={twrnc`bg-[#121826] rounded-3xl p-6 w-full max-w-sm`}>
          {/* Close Button */}
          <TouchableOpacity
            style={twrnc`absolute top-4 right-4 z-10`}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          {/* Badge Display */}
          <View style={twrnc`items-center mb-6`}>
            <View 
              style={[
                twrnc`w-24 h-24 rounded-3xl items-center justify-center mb-4`,
                { backgroundColor: badgeColor + '20', borderColor: badgeColor, borderWidth: 3 }
              ]}
            >
              <Ionicons name={badge.icon} size={40} color={badgeColor} />
            </View>
            
            <CustomText weight="bold" style={twrnc`text-white text-xl text-center mb-2`}>
              {badge.title}
            </CustomText>
            
            <View style={[twrnc`px-3 py-1 rounded-full mb-3`, { backgroundColor: badgeColor }]}>
              <CustomText style={twrnc`text-white text-xs font-bold uppercase`}>
                {badge.rarity}
              </CustomText>
            </View>
            
            <CustomText style={twrnc`text-gray-400 text-center text-sm leading-5`}>
              {badge.description}
            </CustomText>
          </View>
          
          {/* Badge Info */}
          <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-4`}>
            <View style={twrnc`flex-row justify-between items-center mb-2`}>
              <CustomText style={twrnc`text-gray-400 text-sm`}>Category</CustomText>
              <CustomText style={twrnc`text-white text-sm capitalize`}>
                {badge.category}
              </CustomText>
            </View>
            
            {badge.earnedAt && (
              <View style={twrnc`flex-row justify-between items-center`}>
                <CustomText style={twrnc`text-gray-400 text-sm`}>Earned</CustomText>
                <CustomText style={twrnc`text-white text-sm`}>
                  {badge.earnedAt.toDate ? 
                    badge.earnedAt.toDate().toLocaleDateString() : 
                    new Date(badge.earnedAt).toLocaleDateString()
                  }
                </CustomText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Badge Notification Component
export const BadgeNotification = ({ badges, visible, onClose }) => {
  if (!visible || badges.length === 0) return null;
  
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={twrnc`flex-1 bg-black bg-opacity-70 justify-center items-center px-6`}>
        <View style={twrnc`bg-[#121826] rounded-3xl p-6 w-full max-w-sm`}>
          <View style={twrnc`items-center mb-6`}>
            <View style={twrnc`bg-[#FFC107] rounded-full p-4 mb-4`}>
              <Ionicons name="trophy" size={32} color="#121826" />
            </View>
            
            <CustomText weight="bold" style={twrnc`text-white text-2xl text-center mb-2`}>
              {badges.length === 1 ? 'Badge Earned!' : `${badges.length} Badges Earned!`}
            </CustomText>
            
            <CustomText style={twrnc`text-gray-400 text-center text-sm mb-6`}>
              Congratulations on your achievement!
            </CustomText>
          </View>
          
          {/* Badge List */}
          <ScrollView style={twrnc`max-h-60 mb-6`}>
            {badges.map((badge, index) => {
              const badgeColor = BADGE_COLORS[badge.rarity] || BADGE_COLORS.common;
              return (
                <View key={badge.id} style={twrnc`flex-row items-center mb-4 bg-[#2A2E3A] rounded-2xl p-3`}>
                  <View 
                    style={[
                      twrnc`w-12 h-12 rounded-2xl items-center justify-center mr-3`,
                      { backgroundColor: badgeColor + '20', borderColor: badgeColor, borderWidth: 2 }
                    ]}
                  >
                    <Ionicons name={badge.icon} size={20} color={badgeColor} />
                  </View>
                  
                  <View style={twrnc`flex-1`}>
                    <CustomText weight="bold" style={twrnc`text-white text-sm mb-1`}>
                      {badge.title}
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>
                      {badge.description}
                    </CustomText>
                  </View>
                  
                  <View style={[twrnc`px-2 py-1 rounded-full`, { backgroundColor: badgeColor }]}>
                    <CustomText style={twrnc`text-white text-xs font-bold`}>
                      {badge.rarity.toUpperCase()}
                    </CustomText>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          
          <TouchableOpacity
            style={twrnc`bg-[#4361EE] rounded-2xl py-3 items-center`}
            onPress={onClose}
          >
            <CustomText weight="bold" style={twrnc`text-white`}>
              Awesome!
            </CustomText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Badge Section for Dashboard
export const BadgeSection = ({ badges, onViewAll, onBadgePress }) => {
  const recentBadges = badges.slice(0, 6);
  
  return (
    <View style={twrnc`bg-[#2A2E3A] rounded-2xl p-5 mb-6`}>
      <View style={twrnc`flex-row justify-between items-center mb-4`}>
        <View>
          <CustomText weight="bold" style={twrnc`text-white text-lg`}>
            Badges
          </CustomText>
          <CustomText style={twrnc`text-gray-400 text-sm`}>
            {badges.length} earned
          </CustomText>
        </View>
        
        {badges.length > 6 && (
          <TouchableOpacity
            style={twrnc`bg-[#4361EE] px-3 py-2 rounded-xl`}
            onPress={onViewAll}
          >
            <CustomText style={twrnc`text-white text-sm font-medium`}>
              View All
            </CustomText>
          </TouchableOpacity>
        )}
      </View>
      
      {badges.length > 0 ? (
        <BadgeGrid 
          badges={recentBadges} 
          onBadgePress={onBadgePress}
          maxVisible={6}
        />
      ) : (
        <View style={twrnc`items-center py-6`}>
          <View style={twrnc`bg-[#4361EE] bg-opacity-20 rounded-2xl p-4 mb-3`}>
            <Ionicons name="trophy-outline" size={32} color="#4361EE" />
          </View>
          <CustomText style={twrnc`text-gray-400 text-center text-sm`}>
            Complete quests to earn your first badge!
          </CustomText>
        </View>
      )}
    </View>
  );
};

// All Badges Modal (for viewing all badges)
export const AllBadgesModal = ({ visible, badges, onClose, onBadgePress }) => {
  const categorizedBadges = badges.reduce((acc, badge) => {
    if (!acc[badge.category]) {
      acc[badge.category] = [];
    }
    acc[badge.category].push(badge);
    return acc;
  }, {});

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
        <View style={twrnc`bg-[#121826] rounded-t-2xl p-5 h-3/4`}>
          <View style={twrnc`flex-row justify-between items-center mb-6`}>
            <View>
              <CustomText weight="bold" style={twrnc`text-white text-2xl`}>
                All Badges
              </CustomText>
              <CustomText style={twrnc`text-gray-400 text-sm`}>
                {badges.length} badges earned
              </CustomText>
            </View>
            <TouchableOpacity
              style={twrnc`bg-[#2A2E3A] p-3 rounded-2xl`}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {Object.keys(categorizedBadges).map(category => (
              <View key={category} style={twrnc`mb-6`}>
                <CustomText weight="bold" style={twrnc`text-white text-lg mb-3 capitalize`}>
                  {category}
                </CustomText>
                <View style={twrnc`flex-row flex-wrap`}>
                  {categorizedBadges[category].map(badge => (
                    <BadgeItem
                      key={badge.id}
                      badge={badge}
                      size="medium"
                      onPress={onBadgePress}
                    />
                  ))}
                </View>
              </View>
            ))}
            
            {badges.length === 0 && (
              <View style={twrnc`items-center justify-center py-20`}>
                <Ionicons name="trophy-outline" size={64} color="#6B7280" style={twrnc`mb-4`} />
                <CustomText style={twrnc`text-gray-400 text-center text-lg`}>
                  No badges earned yet
                </CustomText>
                <CustomText style={twrnc`text-gray-500 text-center text-sm mt-2`}>
                  Complete quests to start earning badges!
                </CustomText>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
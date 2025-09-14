"use client"
import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Image
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { FontAwesome, Ionicons } from '@expo/vector-icons'
import twrnc from 'twrnc'
import CustomText from '../components/CustomText'

const { width, height } = Dimensions.get('window')

// Add device size logic
const isSmallDevice = width < 375; // iPhone SE and similar small Android devices
const isMediumDevice = width >= 375 && width < 414; // Standard phones
const isLargeDevice = width >= 414; // Large phones

// Responsive font sizes
const responsiveFontSizes = {
  xs: isSmallDevice ? 10 : isMediumDevice ? 11 : 12,
  sm: isSmallDevice ? 12 : isMediumDevice ? 13 : 14,
  base: isSmallDevice ? 14 : isMediumDevice ? 15 : 16,
  lg: isSmallDevice ? 16 : isMediumDevice ? 18 : 20,
  xl: isSmallDevice ? 18 : isMediumDevice ? 20 : 22,
  "2xl": isSmallDevice ? 20 : isMediumDevice ? 22 : 24,
};

// Responsive padding/margin
const responsivePadding = {
  base: isSmallDevice ? 3 : isMediumDevice ? 4 : 5,
  lg: isSmallDevice ? 4 : isMediumDevice ? 5 : 6,
}

const LandingScreen = ({ navigateToSignIn, navigateToSignUp }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [signupLoading, setSignupLoading] = useState(false)
  const [signinLoading, setSigninLoading] = useState(false)

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const titleSlideAnim = useRef(new Animated.Value(-30)).current
  const buttonScaleAnim = useRef(new Animated.Value(0.8)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      startAnimations()
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  const startAnimations = () => {
    // Start entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titleSlideAnim, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 600,
        delay: 400,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start()

    // Start pulse animation for the main button
    startPulseAnimation()
  }

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start()
  }

  const animateButtonPress = (callback) => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(callback)
  }

  const handleNavigate = (type) => {
    animateButtonPress(() => {
      if (type === 'signup') {
        setSignupLoading(true)
        setTimeout(() => {
          setSignupLoading(false)
          navigateToSignUp()
        }, 1500)
      } else if (type === 'signin') {
        setSigninLoading(true)
        setTimeout(() => {
          setSigninLoading(false)
          navigateToSignIn()
        }, 1500)
      }
    })
  }

  if (isLoading) {
    return (
      <View style={twrnc`flex-1 bg-[#121826] justify-center items-center`}>
        <View style={twrnc`items-center`}>
          <View style={twrnc`bg-[#4361EE] p-4 rounded-full mb-4`}>
            <FontAwesome name="heartbeat" size={32} color="#FFFFFF" />
          </View>
          <ActivityIndicator size="large" color="#4361EE" />
          <CustomText weight="medium" style={twrnc`text-white mt-4 text-base`}>
            Loading HakbangQuest...
          </CustomText>
        </View>
      </View>
    )
  }

  return (
    <View style={twrnc`flex-1`}>
      <ImageBackground
        source={require('../assets/images/landing.png')}
        style={twrnc`flex-1`}
        imageStyle={twrnc`opacity-70`}
      >
        {/* Gradient overlay for better text readability */}
        <LinearGradient
          colors={['rgba(18, 24, 38, 0.3)', 'rgba(18, 24, 38, 0.8)', 'rgba(18, 24, 38, 0.95)']}
          style={twrnc`flex-1 justify-end`}
        >
          {/* Header with app branding */}
          <Animated.View
            style={[
              twrnc`absolute top-12 left-0 right-0 items-center z-10`,
              { opacity: fadeAnim, transform: [{ translateY: titleSlideAnim }] }
            ]}
          >
            <View style={twrnc`bg-white bg-opacity-10 backdrop-blur-sm rounded-2xl px-6 py-3 border border-white border-opacity-20`}>
              <View style={twrnc`flex-row items-center`}>
                <Image
                  source={require('../assets/image/icon.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                    borderRadius: 12,  
                    marginRight: 8     
                  }}
                />
                <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                  HakbangQuest
                </CustomText>
              </View>
            </View>
          </Animated.View>

          {/* Main content */}
          <Animated.View
            style={[
              twrnc`p-6 pb-12`,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            {/* Feature highlights */}
            <View style={twrnc`mb-8`}>
              <View style={twrnc`flex-row justify-center mb-6`}>
                {[
                  { icon: 'trophy', color: '#FFD166', label: 'Achievements' },
                  { icon: 'users', color: '#06D6A0', label: 'Community' },
                  { icon: 'line-chart', color: '#4361EE', label: 'Progress' },
                ].map((feature, index) => (
                  <Animated.View
                    key={feature.label}
                    style={[
                      twrnc`items-center mx-4`,
                      {
                        opacity: fadeAnim,
                        transform: [{
                          translateY: slideAnim.interpolate({
                            inputRange: [0, 50],
                            outputRange: [0, 50 + (index * 10)],
                          })
                        }]
                      }
                    ]}
                  >
                    <View style={[twrnc`p-3 rounded-full mb-2 border-2 border-white border-opacity-20`, { backgroundColor: feature.color + '20' }]}>
                      <FontAwesome name={feature.icon} size={20} color={feature.color} />
                    </View>
                    <CustomText weight="medium" style={twrnc`text-white text-xs opacity-80`}>
                      {feature.label}
                    </CustomText>
                  </Animated.View>
                ))}
              </View>
            </View>

            {/* Main title and description */}
            <View style={twrnc`mb-10`}>
              <CustomText
                weight="bold"
                style={twrnc`text-center text-4xl text-white mb-4 leading-tight`}
              >
                Transform Your{'\n'}
                <CustomText weight="bold" style={twrnc`text-[#4361EE] text-4xl`}>
                  Fitness Journey
                </CustomText>
              </CustomText>
              <CustomText style={twrnc`text-center text-base text-white opacity-90 leading-relaxed px-2`}>
                Every step brings progress. Earn rewards, chart goals and unlock a better you with personalized quests and community challenges.
              </CustomText>
            </View>

            {/* Action buttons */}
            <Animated.View
              style={[
                twrnc`items-center`,
                { transform: [{ scale: buttonScaleAnim }] }
              ]}
            >
              {/* Get Started Button */}
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={twrnc`w-full mb-6 shadow-lg`}
                  onPress={() => handleNavigate('signup')}
                  disabled={signupLoading || signinLoading}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#4361EE', '#3651D4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={twrnc`py-${responsivePadding.base} px-${responsivePadding.lg} rounded-2xl items-center flex-row justify-center border border-white border-opacity-10`}
                  >
                    {signupLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <FontAwesome name="rocket" size={18} color="#FFFFFF" style={twrnc`mr-3`} />
                        <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                          Get Started
                        </CustomText>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* Sign In Section */}
              <View style={twrnc`bg-white bg-opacity-5 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white border-opacity-10`}>
                <View style={twrnc`flex-row items-center justify-center`}>
                  <CustomText style={twrnc`text-white opacity-80 mr-2`}>
                    Already have an account?
                  </CustomText>
                  <TouchableOpacity
                    onPress={() => handleNavigate('signin')}
                    disabled={signinLoading || signupLoading}
                    style={twrnc`flex-row items-center`}
                  >
                    {signinLoading ? (
                      <ActivityIndicator color="#FFC107" size="small" />
                    ) : (
                      <>
                        <CustomText weight="bold" style={twrnc`text-[#FFC107] mr-1`}>
                          Sign In
                        </CustomText>
                        <Ionicons name="arrow-forward" size={16} color="#FFC107" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </LinearGradient>
      </ImageBackground>
    </View>
  )
}

export default LandingScreen
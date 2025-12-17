"use client"

import { useEffect, useRef } from "react"
import { Modal, View, TouchableOpacity, Image, Dimensions, Platform, Animated } from "react-native"
import twrnc from "twrnc"
import { FontAwesome } from "@expo/vector-icons"
import CustomText from "./CustomText"

const { width } = Dimensions.get("window")
const isSmallDevice = width < 375

const CustomModal = ({
  visible,
  onClose,
  onConfirm,
  onCancel,
  icon,
  title,
  message,
  type = "success",
  showCancelButton = false,
  confirmText = "OK",
  cancelText = "Cancel",
  image = null,
  buttons = [],
}) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      scaleAnim.setValue(0.8)
      fadeAnim.setValue(0)
    }
  }, [visible])

  const typeConfig = {
    success: {
      iconBg: '#10B981',
      iconColor: '#FFFFFF',
      icon: 'check-circle',
      accentColor: '#10B981',
    },
    error: {
      iconBg: '#EF4444',
      iconColor: '#FFFFFF',
      icon: 'exclamation-circle',
      accentColor: '#EF4444',
    },
    warning: {
      iconBg: '#F59E0B',
      iconColor: '#FFFFFF',
      icon: 'exclamation-triangle',
      accentColor: '#F59E0B',
    },
    info: {
      iconBg: '#3B82F6',
      iconColor: '#FFFFFF',
      icon: 'info-circle',
      accentColor: '#3B82F6',
    },
  }

  const config = typeConfig[type] || typeConfig.info

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={onClose}>
      <Animated.View 
        style={[
          twrnc`flex-1 justify-center items-center`,
          { 
            backgroundColor: 'rgba(0,0,0,0.6)',
            opacity: fadeAnim
          }
        ]}
      >
        <Animated.View
          style={[
            twrnc`bg-[#1F2937] rounded-3xl w-11/12 max-w-md overflow-hidden ${Platform.OS === "android" ? "elevation-16" : ""}`,
            {
              transform: [{ scale: scaleAnim }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 0.3,
              shadowRadius: 30,
            }
          ]}
        >
          {/* Top Accent Strip */}
          <View style={[twrnc`h-1.5`, { backgroundColor: config.accentColor }]}>
            <View style={twrnc`h-full flex-row`}>
              {[...Array(30)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    twrnc`flex-1`,
                    { backgroundColor: i % 2 === 0 ? config.accentColor : `${config.accentColor}CC` }
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={twrnc`p-6`}>
            {/* Icon Section */}
            <View style={twrnc`items-center mb-5`}>
              {image ? (
                <View style={twrnc`relative mb-4`}>
                  {/* Pulse rings for image */}
                  <View 
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      { 
                        backgroundColor: config.accentColor,
                        opacity: 0.1,
                        transform: [{ scale: 1.3 }]
                      }
                    ]} 
                  />
                  <View 
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      { 
                        backgroundColor: config.accentColor,
                        opacity: 0.15,
                        transform: [{ scale: 1.15 }]
                      }
                    ]} 
                  />
                  <Image 
                    source={{ uri: image }} 
                    style={[
                      twrnc`w-20 h-20 rounded-full`,
                      { borderWidth: 3, borderColor: config.accentColor }
                    ]} 
                    resizeMode="cover" 
                  />
                </View>
              ) : (
                <View style={twrnc`relative mb-4`}>
                  {/* Pulse rings for icon */}
                  <View 
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      { 
                        backgroundColor: config.accentColor,
                        opacity: 0.1,
                        transform: [{ scale: 1.4 }]
                      }
                    ]} 
                  />
                  <View 
                    style={[
                      twrnc`absolute inset-0 rounded-full`,
                      { 
                        backgroundColor: config.accentColor,
                        opacity: 0.15,
                        transform: [{ scale: 1.2 }]
                      }
                    ]} 
                  />
                  
                  {/* Icon container */}
                  <View
                    style={[
                      twrnc`w-16 h-16 rounded-full items-center justify-center`,
                      { 
                        backgroundColor: config.iconBg,
                        borderWidth: 2,
                        borderColor: `${config.accentColor}40`
                      }
                    ]}
                  >
                    <FontAwesome
                      name={icon || config.icon}
                      size={28}
                      color={config.iconColor}
                    />
                  </View>
                </View>
              )}

              {/* Title */}
              <CustomText 
                weight="bold" 
                style={twrnc`${isSmallDevice ? 'text-lg' : 'text-xl'} text-white mb-2 text-center`}
              >
                {title}
              </CustomText>

              {/* Message */}
              <CustomText 
                style={twrnc`${isSmallDevice ? 'text-sm' : 'text-base'} text-gray-400 text-center leading-6`}
              >
                {message}
              </CustomText>
            </View>

            {/* Buttons Section */}
            <View style={twrnc`mt-2`}>
              {buttons.length > 0 ? (
                /* Custom Buttons */
                <View style={twrnc`flex-row flex-wrap -mx-1`}>
                  {buttons.map((button, index) => {
                    let buttonBg = '#374151' // default
                    let buttonTextColor = '#FFFFFF'
                    
                    if (button.style === "primary") {
                      buttonBg = config.accentColor
                      buttonTextColor = '#FFFFFF'
                    } else if (button.style === "danger") {
                      buttonBg = '#EF4444'
                      buttonTextColor = '#FFFFFF'
                    } else if (button.style === "secondary") {
                      buttonBg = '#4B5563'
                      buttonTextColor = '#FFFFFF'
                    } else if (button.style === "outline") {
                      buttonBg = 'transparent'
                      buttonTextColor = config.accentColor
                    }

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          twrnc`flex-1 py-3.5 rounded-xl items-center mx-1 mb-2`,
                          { 
                            backgroundColor: buttonBg,
                            borderWidth: button.style === "outline" ? 2 : 0,
                            borderColor: button.style === "outline" ? config.accentColor : 'transparent',
                            minWidth: buttons.length > 2 ? '45%' : 'auto'
                          }
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          const shouldClose = button.action()
                          if (shouldClose !== false) {
                            onClose()
                          }
                        }}
                      >
                        <CustomText 
                          weight="bold" 
                          style={[
                            twrnc`${isSmallDevice ? 'text-sm' : 'text-base'} uppercase tracking-wide`,
                            { color: buttonTextColor }
                          ]}
                        >
                          {button.label}
                        </CustomText>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : (
                /* Default Confirm/Cancel Buttons */
                <View style={twrnc`flex-row ${showCancelButton ? '' : 'justify-center'}`}>
                  {showCancelButton && (
                    <TouchableOpacity
                      style={twrnc`bg-[#374151] py-3.5 rounded-xl items-center flex-1 mr-2`}
                      onPress={onCancel || onClose}
                      activeOpacity={0.8}
                    >
                      <CustomText 
                        weight="bold" 
                        style={twrnc`text-white ${isSmallDevice ? 'text-sm' : 'text-base'} uppercase tracking-wide`}
                      >
                        {cancelText}
                      </CustomText>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      twrnc`py-3.5 rounded-xl items-center ${showCancelButton ? 'flex-1 ml-2' : 'w-full'}`,
                      { backgroundColor: config.accentColor }
                    ]}
                    onPress={onConfirm || onClose}
                    activeOpacity={0.8}
                  >
                    <CustomText 
                      weight="bold" 
                      style={twrnc`text-white ${isSmallDevice ? 'text-sm' : 'text-base'} uppercase tracking-wide`}
                    >
                      {confirmText}
                    </CustomText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Bottom Accent Line */}
          <View style={twrnc`h-1 flex-row`}>
            {[...Array(20)].map((_, i) => (
              <View
                key={i}
                style={[
                  twrnc`flex-1 h-full`,
                  { backgroundColor: i % 2 === 0 ? `${config.accentColor}40` : `${config.accentColor}20` }
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

export default CustomModal
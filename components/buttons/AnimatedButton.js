import React, { useRef, useEffect } from "react";
import { TouchableOpacity, Animated } from "react-native";

const AnimatedButton = ({
  children,
  onPress,
  style,
  disabled,
  active = false, // 🔑 NEW: pass active state here
  activeOpacity = 0.8,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const activeAnim = useRef(new Animated.Value(active ? 1 : 0)).current;

  // 🔄 Animate when `active` changes
  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: active ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // false for colors
    }).start();
  }, [active]);

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.95,
        speed: 15,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.85,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        speed: 15,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 🔑 Example: interpolate a backgroundColor from inactive → active
  const bgColor = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#2A2E3A", "#3B82F6"], // inactive → active
  });

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
          backgroundColor: bgColor, // animate bg smoothly
          borderRadius: 16,
        },
        style,
      ]}
    >
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={activeOpacity}
        {...props}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default AnimatedButton;

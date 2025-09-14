// components/CountdownOverlay.js
import React, { useState, useEffect, useRef } from "react";
import { View, Animated, Easing, Vibration } from "react-native";
import twrnc from "twrnc";
import CustomText from "./CustomText"; // Assuming you have a CustomText component

const CountdownOverlay = ({ onCountdownFinish }) => {
  const [count, setCount] = useState(3);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const animateNumber = (callback) => {
    scaleAnim.setValue(0);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800, // Animation duration for each number
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Fade out
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(callback);
    });
  };

  useEffect(() => {
    if (count > 0) {
      Vibration.vibrate(50); // Haptic feedback
      animateNumber(() => {
        const timer = setTimeout(() => {
          setCount((prevCount) => prevCount - 1);
        }, 200); // Short delay before next number appears
        return () => clearTimeout(timer);
      });
    } else if (count === 0) {
      Vibration.vibrate(100); // Stronger haptic for "GO!"
      animateNumber(() => {
        const timer = setTimeout(() => {
          onCountdownFinish();
        }, 500); // Short delay before finishing
        return () => clearTimeout(timer);
      });
    }
  }, [count, onCountdownFinish]);

  return (
    <View style={twrnc`absolute inset-0 bg-[#121826] items-center justify-center z-50`}>
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}
      >
        <CustomText weight="bold" style={twrnc`text-white text-9xl`}>
          {count === 0 ? "GO!" : count}
        </CustomText>
      </Animated.View>
    </View>
  );
};

export default CountdownOverlay;
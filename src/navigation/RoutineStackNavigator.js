import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrainingScreen, { ActivityScreen } from '../screens/Training/TrainingScreen';
import CreateRoutineScreen from '../screens/Routine/CreateRoutineScreen';

const RoutineStack = createNativeStackNavigator();

export default function RoutineStackScreen() {
  return (
    <RoutineStack.Navigator initialRouteName="RoutineList" screenOptions={{ headerShown: false }}>
      <RoutineStack.Screen name="RoutineList" component={TrainingScreen} />
      <RoutineStack.Screen name="Activity" component={ActivityScreen} />
      <RoutineStack.Screen name="CreateRoutine" component={CreateRoutineScreen} />
    </RoutineStack.Navigator>
  );
}

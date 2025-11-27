import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoutineListScreen from '../screens/Routine/RoutineListScreen';
import CreateRoutineScreen from '../screens/Routine/CreateRoutineScreen';

const RoutineStack = createNativeStackNavigator();

export default function RoutineStackScreen() {
  return (
    <RoutineStack.Navigator 
      initialRouteName="RoutineList"
      screenOptions={{ headerShown: false }}
    >
      <RoutineStack.Screen name="RoutineList" component={RoutineListScreen} />
      <RoutineStack.Screen name="CreateRoutine" component={CreateRoutineScreen} />
    </RoutineStack.Navigator>
  );
}



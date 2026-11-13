import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import {
  BaseNavigationContainer,
  createNavigatorFactory,
  useNavigationBuilder,
} from '@react-navigation/core';
import { StackRouter, TabRouter } from '@react-navigation/routers';
import { navigateToCreateRoutine } from '../src/navigation/navigationHelpers.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(t) {
  const ref = React.createRef();
  let home, training, editor, editorRoute;
  function StackNavigator({ children }) {
    const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
      children,
      initialRouteName: 'RoutineList',
    });
    return React.createElement(
      NavigationContent,
      null,
      descriptors[state.routes[state.index].key].render(),
    );
  }
  function TabNavigator({ children }) {
    const { state, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, {
      children,
      initialRouteName: 'Home',
    });
    return React.createElement(
      NavigationContent,
      null,
      state.routes
        .filter((route, index) => index === state.index || route.state)
        .map((route) =>
          React.createElement(React.Fragment, { key: route.key }, descriptors[route.key].render()),
        ),
    );
  }
  const Stack = createNavigatorFactory(StackNavigator)();
  const Tabs = createNavigatorFactory(TabNavigator)();
  function Home({ navigation }) {
    home = navigation;
    return null;
  }
  function List({ navigation }) {
    training = navigation;
    return null;
  }
  function Editor({ navigation, route }) {
    editor = navigation;
    editorRoute = route;
    return null;
  }
  function Routine() {
    return React.createElement(
      Stack.Navigator,
      null,
      React.createElement(Stack.Screen, { name: 'RoutineList', component: List }),
      React.createElement(Stack.Screen, { name: 'CreateRoutine', component: Editor }),
    );
  }
  let root;
  await act(async () => {
    root = create(
      React.createElement(
        BaseNavigationContainer,
        { ref },
        React.createElement(
          Tabs.Navigator,
          null,
          React.createElement(Tabs.Screen, { name: 'Home', component: Home }),
          React.createElement(Tabs.Screen, { name: 'Routine', component: Routine }),
        ),
      ),
    );
  });
  t.after(async () => act(async () => root.unmount()));
  const tab = () => {
    const state = ref.current.getRootState();
    return state.routes[state.index];
  };
  return {
    get editorRoute() {
      return editorRoute;
    },
    tab,
    async openFromTimer(template) {
      await act(async () => navigateToCreateRoutine(home, template));
    },
    async visitTraining() {
      await act(async () => home.navigate('Routine'));
    },
    async openFromTraining(template) {
      await act(async () => navigateToCreateRoutine(training, template));
    },
    async back() {
      await act(async () => editor.goBack());
    },
  };
}

test('first Timer create keeps the Training list beneath the editor and Back returns there', async (t) => {
  const h = await mount(t);
  await h.openFromTimer();
  assert.deepEqual(
    h.tab().state.routes.map((route) => route.name),
    ['RoutineList', 'CreateRoutine'],
  );
  await h.back();
  assert.equal(h.tab().name, 'Routine');
  assert.deepEqual(
    h.tab().state.routes.map((route) => route.name),
    ['RoutineList'],
  );
});

test('first nested template entry keeps its exact routine parameters and a list return path', async (t) => {
  const h = await mount(t);
  const template = {
    id: 'chosen-routine',
    name: 'Selected',
    audioAlerts: { countdown: { seconds: 10 } },
  };
  await h.openFromTimer(template);
  assert.deepEqual(h.editorRoute.params.templateRoutine, template);
  await h.back();
  assert.equal(h.tab().name, 'Routine');
  assert.equal(h.tab().state.routes[h.tab().state.index].name, 'RoutineList');
});

test('creating inside an already visited Training stack retains normal direct navigation', async (t) => {
  const h = await mount(t);
  await h.visitTraining();
  await h.openFromTraining();
  assert.deepEqual(
    h.tab().state.routes.map((route) => route.name),
    ['RoutineList', 'CreateRoutine'],
  );
  await h.back();
  assert.equal(h.tab().state.routes.length, 1);
});

test('a later new routine opens a fresh editor after returning from a template', async (t) => {
  const h = await mount(t);
  await h.openFromTimer({ id: 'previous', name: 'Previous' });
  const firstKey = h.editorRoute.key;
  await h.back();
  await h.openFromTraining();
  assert.notEqual(h.editorRoute.key, firstKey);
  assert.equal(h.editorRoute.params?.templateRoutine, undefined);
  assert.equal(h.tab().state.routes.length, 2);
});

import React,{forwardRef,useCallback,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {Animated,ScrollView,View,StyleSheet} from 'react-native';
import type {LayoutChangeEvent,NativeScrollEvent,NativeSyntheticEvent} from 'react-native';
import type {Tab} from '../lib/types';
import type {MenuMotion} from '../lib/menu-motion';
import {TAB_ORDER,tabIndex,createPagerSelection} from '../lib/tab-navigation';

export type TabPagerHandle = {goTo: (tab: Tab) => void};
type Props = {motion: MenuMotion; activeTab: Tab; enabled: boolean; onSelect: (tab: Tab) => void; children: React.ReactNode};

/** Native horizontal paging for gestures; menu taps never animate or await a render. */
export const TabPager = forwardRef<TabPagerHandle,Props>(function TabPager({activeTab,enabled,onSelect,children,motion},ref) {
  const scroll = useRef<ScrollView>(null);
  const size = useRef(0);
  const [width,setWidth] = useState(0);
  const selection = useRef(createPagerSelection(activeTab));
  const latest = useRef({activeTab,enabled,onSelect});
  latest.current = {activeTab,enabled,onSelect};

  const align = useCallback(() => {
    // Content/layout updates must not pull the native surface away from the finger.
    // Keep this guard through momentum; an explicit menu tap clears it in goTo.
    if (selection.current.isDragging()) return;
    const index = tabIndex(selection.current.current());
    if (size.current > 0 && index >= 0) scroll.current?.scrollTo({x:index * size.current,y:0,animated:false});
  },[]);
  const goTo = useCallback((next: Tab) => {
    selection.current.select(next);
    motion.select(next);
    align();
  },[align,motion]);
  useImperativeHandle(ref,() => ({goTo}),[goTo]);
  // Keep the selected page aligned after layout changes, not after a timer/animation.
  useLayoutEffect(() => {goTo(activeTab);},[activeTab,width,goTo]);
  useLayoutEffect(() => {if (!enabled) {selection.current.cancelDrag();align();}},[enabled,align]);
  const layout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== size.current) {size.current=next;motion.resize(next,selection.current.current());setWidth(next);}
  },[motion]);
  const begin = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (latest.current.enabled) {selection.current.beginDrag();motion.beginDrag(event.nativeEvent.contentOffset.x);}
  },[motion]);
  const finish = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!latest.current.enabled) {goTo(latest.current.activeTab);return;}
    if (!selection.current.isDragging()) return;
    const next = selection.current.finishDrag(event.nativeEvent.contentOffset.x,size.current);
    motion.settle(selection.current.current(),event.nativeEvent.contentOffset.x);
    if (next) latest.current.onSelect(next);
  },[goTo,motion]);
  // A stationary drag ending exactly on a page may not emit a momentum event.
  const endDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x, w = size.current;
    const velocity = event.nativeEvent.velocity?.x;
    if (w > 0 && velocity !== undefined && Math.abs(velocity) < 0.01 && Math.abs(x - Math.round(x/w)*w) < 0.5) finish(event);
  },[finish]);

  return <View style={styles.fill} onLayout={layout}>
    <Animated.ScrollView ref={scroll} horizontal pagingEnabled snapToInterval={width || undefined}
      disableIntervalMomentum decelerationRate="fast" directionalLockEnabled nestedScrollEnabled
      scrollEnabled={enabled && width > 0} showsHorizontalScrollIndicator={false}
      bounces={false} overScrollMode="never" removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
      onScroll={motion.onScroll} scrollEventThrottle={16}
      onScrollBeginDrag={begin} onScrollEndDrag={endDrag} onMomentumScrollEnd={finish}
      onContentSizeChange={align} style={styles.fill} contentContainerStyle={styles.row}>
      {React.Children.map(children,(child,index) => <View key={TAB_ORDER[index]} collapsable={false}
        style={[styles.page,{width}]} accessibilityElementsHidden={activeTab !== TAB_ORDER[index]}
        importantForAccessibility={activeTab === TAB_ORDER[index] ? 'auto' : 'no-hide-descendants'}>{child}</View>)}
    </Animated.ScrollView>
  </View>;
});
const styles=StyleSheet.create({fill:{flex:1},row:{height:'100%'},page:{height:'100%',flexShrink:0}});

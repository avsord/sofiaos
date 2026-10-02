import React,{forwardRef,useCallback,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {ScrollView,View,StyleSheet} from 'react-native';
import type {LayoutChangeEvent,NativeScrollEvent,NativeSyntheticEvent} from 'react-native';
import type {Tab} from '../lib/types';
import {TAB_ORDER,tabIndex,createPagerSelection} from '../lib/tab-navigation';

export type TabPagerHandle = {goTo: (tab: Tab) => void};
type Props = {activeTab: Tab; enabled: boolean; onSelect: (tab: Tab) => void; children: React.ReactNode};

/** Native horizontal paging for gestures; menu taps never animate or await a render. */
export const TabPager = forwardRef<TabPagerHandle,Props>(function TabPager({activeTab,enabled,onSelect,children},ref) {
  const scroll = useRef<ScrollView>(null);
  const size = useRef(0);
  const [width,setWidth] = useState(0);
  const selection = useRef(createPagerSelection(activeTab));
  const latest = useRef({activeTab,enabled,onSelect});
  latest.current = {activeTab,enabled,onSelect};

  const align = useCallback(() => {
    const index = tabIndex(selection.current.current());
    if (size.current > 0 && index >= 0) scroll.current?.scrollTo({x:index * size.current,y:0,animated:false});
  },[]);
  const goTo = useCallback((next: Tab) => {
    selection.current.select(next);
    align();
  },[align]);
  useImperativeHandle(ref,() => ({goTo}),[goTo]);
  // Keep the selected page aligned after layout changes, not after a timer/animation.
  useLayoutEffect(() => {goTo(activeTab);},[activeTab,width,goTo]);
  useLayoutEffect(() => {if (!enabled) {selection.current.cancelDrag();align();}},[enabled,align]);
  const layout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== size.current) {size.current=next;setWidth(next);}
  },[]);
  const begin = useCallback(() => {
    if (latest.current.enabled) selection.current.beginDrag();
  },[]);
  const finish = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!latest.current.enabled) {goTo(latest.current.activeTab);return;}
    const next = selection.current.finishDrag(event.nativeEvent.contentOffset.x,size.current);
    if (next) latest.current.onSelect(next);
  },[goTo]);
  // A stationary drag ending exactly on a page may not emit a momentum event.
  const endDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x, w = size.current;
    const velocity = event.nativeEvent.velocity?.x;
    if (w > 0 && velocity !== undefined && Math.abs(velocity) < 0.01 && Math.abs(x - Math.round(x/w)*w) < 0.5) finish(event);
  },[finish]);

  return <View style={styles.fill} onLayout={layout}>
    <ScrollView ref={scroll} horizontal pagingEnabled snapToInterval={width || undefined}
      disableIntervalMomentum decelerationRate="fast" directionalLockEnabled nestedScrollEnabled
      scrollEnabled={enabled && width > 0} showsHorizontalScrollIndicator={false}
      bounces={false} overScrollMode="never" removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
      onScrollBeginDrag={begin} onScrollEndDrag={endDrag} onMomentumScrollEnd={finish}
      onContentSizeChange={align} style={styles.fill} contentContainerStyle={styles.row}>
      {React.Children.map(children,(child,index) => <View key={TAB_ORDER[index]} collapsable={false}
        style={[styles.page,{width}]} accessibilityElementsHidden={activeTab !== TAB_ORDER[index]}
        importantForAccessibility={activeTab === TAB_ORDER[index] ? 'auto' : 'no-hide-descendants'}>{child}</View>)}
    </ScrollView>
  </View>;
});
const styles=StyleSheet.create({fill:{flex:1},row:{height:'100%'},page:{height:'100%'}});

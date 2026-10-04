import React,{forwardRef,useCallback,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Animated,ScrollView,View,StyleSheet} from 'react-native';
import type {LayoutChangeEvent,NativeScrollEvent,NativeSyntheticEvent} from 'react-native';
import type {Tab} from '../lib/types';
import type {MenuMotion} from '../lib/menu-motion';
import {TAB_ORDER,tabIndex,createPagerSelection} from '../lib/tab-navigation';

export type TabPagerHandle = {goTo: (tab: Tab) => void};
type Props = {motion: MenuMotion; activeTab: Tab; enabled: boolean; onSelect: (tab: Tab) => void; children: React.ReactNode};

/** Native paging with a measured initial offset; taps never wait for an animation. */
export const TabPager = forwardRef<TabPagerHandle,Props>(function TabPager({activeTab,enabled,onSelect,children,motion},ref) {
  const scroll = useRef<ScrollView>(null);
  const size = useRef(0),measured = useRef({viewport:0,content:0});
  const [width,setWidth] = useState(0),[readyWidth,setReadyWidth] = useState(0);
  const selection = useRef(createPagerSelection(activeTab));
  const latest = useRef({activeTab,enabled,onSelect});
  latest.current = {activeTab,enabled,onSelect};

  const align = useCallback(() => {
    // Do not issue a scroll into zero/old-width content: Android would clamp it to Home.
    // Either native layout event may arrive first; both must describe the current geometry.
    const w=size.current,m=measured.current;
    if(w<=0 || Math.abs(m.viewport-w)>0.5 || Math.abs(m.content-w*TAB_ORDER.length)>1) return;
    if(selection.current.isDragging()) return; // Never pull a live drag/momentum away from the finger.
    const index=tabIndex(selection.current.current());
    if(index>=0 && scroll.current) {
      scroll.current.scrollTo({x:index*w,y:0,animated:false});
      setReadyWidth(w);
    }
  },[]);
  const goTo = useCallback((next: Tab) => {
    selection.current.select(next);
    motion.select(next);
    align();
  },[align,motion]);
  useImperativeHandle(ref,() => ({goTo}),[goTo]);
  // The motion owner survives login/bootstrap; a fresh pager must not inherit its old tab.
  useLayoutEffect(() => {motion.reset(selection.current.current());},[motion]);
  useLayoutEffect(() => {if(activeTab!==selection.current.current())goTo(activeTab);},[activeTab,goTo]);
  useLayoutEffect(() => {if (!enabled) {selection.current.cancelDrag();align();}},[enabled,align]);
  const layout = useCallback((event: LayoutChangeEvent) => {
    const next=event.nativeEvent.layout.width;
    if(Number.isFinite(next) && next>0 && next!==size.current) {
      size.current=next;measured.current={viewport:0,content:0};
      selection.current.cancelDrag();motion.resize(next,selection.current.current());
      motion.reset(selection.current.current());setWidth(next);
    }
  },[motion]);
  const nativeLayout = useCallback((event: LayoutChangeEvent) => {
    const w=event.nativeEvent.layout.width;
    if(Math.abs(w-size.current)>0.5)return;
    measured.current.viewport=w;align();
  },[align]);
  const contentLayout = useCallback((contentWidth:number) => {
    if(Math.abs(contentWidth-size.current*TAB_ORDER.length)>1)return;
    measured.current.content=contentWidth;align();
  },[align]);
  // Stable across tab changes, so a React render can never overwrite a native swipe.
  // Recomputed only for a new viewport (first mount / resize).
  const initialOffset=useMemo(()=>({x:Math.max(0,tabIndex(selection.current.current()))*width,y:0}),[width]);
  const begin = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (latest.current.enabled) {selection.current.beginDrag();motion.beginDrag(event.nativeEvent.contentOffset.x);}
  },[motion]);
  const finish = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!latest.current.enabled) {goTo(latest.current.activeTab);return;}
    if (!selection.current.canFinish(event.timeStamp)) return;
    const x=event.nativeEvent.contentOffset.x,w=size.current;
    if(w<=0||Math.abs(x-Math.round(x/w)*w)>1)return;
    const next = selection.current.finishDrag(x,w,event.timeStamp);
    motion.settle(selection.current.current(),event.nativeEvent.contentOffset.x);
    if (next) latest.current.onSelect(next);
  },[goTo,motion]);
  const endDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    selection.current.release(event.timeStamp);
    const x = event.nativeEvent.contentOffset.x, w = size.current;
    const velocity = event.nativeEvent.velocity?.x;
    if (w > 0 && velocity !== undefined && Math.abs(velocity) < 0.01 && Math.abs(x - Math.round(x/w)*w) < 0.5) finish(event);
  },[finish]);

  return <View style={styles.fill} onLayout={layout}>
    {width>0?<Animated.ScrollView ref={scroll} horizontal pagingEnabled snapToInterval={width}
      contentOffset={initialOffset} onLayout={nativeLayout} scrollsChildToFocus={false}
      disableIntervalMomentum decelerationRate="fast" directionalLockEnabled nestedScrollEnabled
      scrollEnabled={enabled && readyWidth===width} showsHorizontalScrollIndicator={false}
      bounces={false} overScrollMode="never" removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
      onScroll={motion.onScroll} scrollEventThrottle={16}
      onScrollBeginDrag={begin} onScrollEndDrag={endDrag} onMomentumScrollEnd={finish}
      onContentSizeChange={contentLayout} style={[styles.fill,{opacity:readyWidth===width?1:0}]}
      contentContainerStyle={[styles.row,{width:width*TAB_ORDER.length}]}>
      {React.Children.map(children,(child,index) => <View key={TAB_ORDER[index]} collapsable={false}
        style={[styles.page,{width}]} accessibilityElementsHidden={activeTab !== TAB_ORDER[index]}
        importantForAccessibility={activeTab === TAB_ORDER[index] ? 'auto' : 'no-hide-descendants'}>{child}</View>)}
    </Animated.ScrollView>:null}
  </View>;
});
const styles=StyleSheet.create({fill:{flex:1},row:{height:'100%'},page:{height:'100%',flexShrink:0}});

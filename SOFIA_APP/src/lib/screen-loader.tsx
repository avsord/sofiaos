import React from 'react';

type Screen=React.ComponentType<any>;
const cache=new Map<string,Screen>();
function once(name:string,load:()=>Screen):Screen{
 const existing=cache.get(name);if(existing)return existing;
 const component=React.memo(load()) as unknown as Screen;cache.set(name,component);return component;
}
/** Literal requires stay inside loaders so Metro/Hermes does not execute the
 * heavy screen module before that screen is warmed or selected.
 */
export const loadHome=()=>once('home',()=>require('../screens/Home').Home);
export const loadChat=()=>once('chat',()=>require('../screens/Chat').Chat);
export const loadPages=()=>once('pages',()=>require('../screens/Pages').Pages);
export const loadAgenda=()=>once('agenda',()=>require('../screens/Agenda').Agenda);
export const loadWorkspace=()=>once('apps',()=>require('../screens/Workspace').Workspace);
export const loadEntityEditor=()=>once('entity-editor',()=>require('../screens/Workspace').EntityEditor);
export const loadProfile=()=>once('profile',()=>require('../screens/Profile').Profile);
export const loadNotifications=()=>once('notifications',()=>require('../screens/Notifications').Notifications);

export function DeferredScreen({load,screenProps}:{load:()=>Screen;screenProps:Record<string,unknown>}){
 const Component=load();return <Component {...screenProps}/>;
}

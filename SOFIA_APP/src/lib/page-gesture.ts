/** A row gesture owns pull-to-refresh from DOWN through UP/CANCEL and queued events. */
export class PageRefreshGuard {
 private active=false;
 private blockedUntil=0;
 constructor(private readonly now:()=>number=Date.now){}
 setActive(value:boolean):void {
  this.active=value;
  // Native refresh callbacks may already be queued when the finger is lifted.
  this.blockedUntil=this.now()+300;
 }
 canRefresh():boolean {return !this.active&&this.now()>=this.blockedUntil;}
}

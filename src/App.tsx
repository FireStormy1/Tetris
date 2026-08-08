import { type ReactNode, type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, ExternalLink, Pause, Play as PlayIcon, RotateCcw, Share2 } from 'lucide-react';
const developerPortrait = '/Picture.jpeg';

const queryClient = new QueryClient();
type Difficulty = 'Easy' | 'Normal' | 'Hard';
type PieceName = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
type Cell = PieceName | null;
type GameStatus = 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type Point = [number, number];
type ActivePiece = { type: PieceName; cells: Point[]; x: number; y: number; rotation: number };

const SHAPES: Record<PieceName, Point[]> = {
  I: [[0,1],[1,1],[2,1],[3,1]], J: [[0,0],[0,1],[1,1],[2,1]], L: [[2,0],[0,1],[1,1],[2,1]],
  O: [[1,0],[2,0],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]], T: [[1,0],[0,1],[1,1],[2,1]], Z: [[0,0],[1,0],[1,1],[2,1]],
};
const DIFFICULTY_SPEED: Record<Difficulty, number> = { Easy: 900, Normal: 620, Hard: 400 };
const PIECES: PieceName[] = ['I','J','L','O','S','T','Z'];
const emptyBoard = (): Cell[][] => Array.from({ length: 20 }, () => Array<Cell>(10).fill(null));
const cloneCells = (cells: Point[]) => cells.map(([x,y]) => [x,y] as Point);
const rotateCells = (cells: Point[]) => {
  const rotated = cells.map(([x,y]) => [-y, x] as Point);
  const minX = Math.min(...rotated.map(([x]) => x)); const minY = Math.min(...rotated.map(([,y]) => y));
  return rotated.map(([x,y]) => [x-minX, y-minY] as Point);
};
const shuffle = (items: PieceName[]) => {
  const result = [...items]; for (let i=result.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result;
};
const newPiece = (type: PieceName): ActivePiece => ({ type, cells: cloneCells(SHAPES[type]), x: 3, y: 0, rotation: 0 });
const collides = (board: Cell[][], piece: ActivePiece, dx=0, dy=0, cells=piece.cells) =>
  cells.some(([x,y]) => { const nx=piece.x+x+dx, ny=piece.y+y+dy; return nx<0 || nx>=10 || ny>=20 || (ny>=0 && board[ny][nx]); });
const mergePiece = (board: Cell[][], piece: ActivePiece) => {
  const next = board.map(row => [...row]); piece.cells.forEach(([x,y]) => { const nx=piece.x+x, ny=piece.y+y; if (ny>=0&&ny<20) next[ny][nx]=piece.type; }); return next;
};
const clearLines = (board: Cell[][]) => { const kept=board.filter(row=>row.some(cell=>!cell)); const lines=20-kept.length; return { board:[...Array.from({length:lines},()=>Array<Cell>(10).fill(null)),...kept], lines }; };
const ghostY = (board: Cell[][], piece: ActivePiece) => { let d=0; while(!collides(board,piece,0,d+1)) d++; return d; };

function Header() {
  const [location] = useLocation();
  const items = [['/','TETRIS'],['/play','PLAY'],['/rules','RULES'],['/how-to-play','HOW TO PLAY'],['/developer','DEVELOPER']];
  return <header className="topbar"><Link href="/" className="wordmark" data-testid="link-home"><span className="wordmark-mark"><i/><i/><i/><i/></span>TETRIS</Link><nav className="nav">{items.slice(1).map(([href,label])=><Link key={href} href={href} className={location===href?'active':''} data-testid={`link-${label.toLowerCase().replaceAll(' ','-')}`}>{label}</Link>)}</nav></header>;
}
function Shell({ children, gameMode = false }: { children: ReactNode; gameMode?: boolean }) {
  useEffect(() => {
    if (!gameMode) return;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [gameMode]);

  return <div className={`app-shell${gameMode ? ' game-shell' : ''}`}><Header/><main className="main">{children}</main></div>;
}
function Home() {
  return <Shell><section className="home-hero"><div><div className="eyebrow">A study in falling blocks / 1984—now</div><h1 className="display">FALL<br/><span style={{color:'var(--coral)'}}>INTO</span><br/>PLACE.</h1><p className="lead">The familiar puzzle, printed with a little more intention. Seven pieces. One clean board. Find the rhythm.</p><Link href="/play" className="button coral" data-testid="button-start-home">START A GAME <ArrowRight size={15}/></Link></div><div className="hero-plate"><div className="hero-board">{Array.from({length:54},(_,i)=><span key={i}/>)}</div></div></section><section className="manifesto rule"><div><div className="eyebrow">The brief</div><h2 className="display">Quiet hands.<br/>Sharp eyes.</h2></div><p>Tetris is a small machine that asks for your full attention. This edition keeps the board dark, the paper warm, and the rules honest. No noise between you and the next move.</p></section><section className="home-index"><div className="index-item"><strong>01</strong><span>Choose a pace that suits the moment.</span></div><div className="index-item"><strong>02</strong><span>Turn, slide, and place with purpose.</span></div><div className="index-item"><strong>03</strong><span>Clear the line. Keep the score.</span></div></section></Shell>;
}
function Play() {
  const [, setLocation] = useLocation();
  const choose = (difficulty: Difficulty) => { sessionStorage.setItem('tetris-difficulty',difficulty); setLocation('/game'); };
  const cards: { name: Difficulty; note: string; speed: string; color: string }[] = [{name:'Easy',note:'A patient pace for learning the shape of the board.',speed:'900 ms / drop',color:'var(--sage)'},{name:'Normal',note:'The classic tempo. Familiar, focused, fair.',speed:'620 ms / drop',color:'var(--mustard)'},{name:'Hard',note:'Quick decisions. Every gap matters.',speed:'400 ms / drop',color:'var(--coral)'}];
  return <Shell><div className="play-page"><div className="page-intro"><div className="eyebrow">02 / Select difficulty</div><h1 className="display">SET THE<br/><span style={{color:'var(--coral)'}}>PACE.</span></h1><p>The pieces are the same. The clock is not. Start where your hands feel ready.</p></div><section className="difficulty-grid">{cards.map(card=><button key={card.name} className="difficulty-card paper-card" onClick={()=>choose(card.name)} data-testid={`button-difficulty-${card.name.toLowerCase()}`}><div><span className="eyebrow" style={{color:card.color}}>{card.name}</span><h2 className="display">{card.name}</h2><p>{card.note}</p></div><span className="speed">{card.speed} →</span></button>)}</section></div></Shell>;
}
function Rules() {
  return <Shell><div className="page-intro"><div className="eyebrow">03 / Instruction sheet</div><h1 className="display">THE<br/><span style={{color:'var(--coral)'}}>RULES.</span></h1><p>Simple enough to learn in a minute. Deep enough to keep you coming back.</p></div><div className="sheet rule-columns"><div><article className="rule-block"><h2>Make room.</h2><p>Arrange falling tetrominoes to complete horizontal lines. A complete line clears. Keep the stack below the top edge.</p></article><article className="rule-block"><h2>Score with intent.</h2><ul><li>Single line — 100 × level</li><li>Double line — 300 × level</li><li>Triple line — 500 × level</li><li>Four lines — 800 × level</li><li>Soft drop — 1 point / cell</li><li>Hard drop — 2 points / cell</li></ul></article></div><div><article className="rule-block"><h2>Level is earned.</h2><p>Every ten cleared lines raises the level. The board falls faster. Your score multiplies with it.</p><p className="eyebrow" style={{marginTop:24}}>level = floor(lines / 10) + 1</p></article><article className="rule-block"><h2>Seven, in order.</h2><p>Every piece comes from a shuffled bag of all seven standard shapes. No piece repeats until the bag is empty.</p></article></div></div></Shell>;
}
function HowToPlay() {
  return <Shell><div className="page-intro"><div className="eyebrow">04 / Field notes</div><h1 className="display">MOVE<br/><span style={{color:'var(--coral)'}}>WELL.</span></h1><p>Keyboard on the desk. Touchscreen in your hand. The same small vocabulary of decisive moves.</p></div><div className="rule-columns sheet"><div><article className="rule-block"><h2>Desktop</h2><div className="control-list"><div className="control-row"><span><span className="key">←</span><span className="key">→</span></span><span>move left / right</span></div><div className="control-row"><span><span className="key">↓</span></span><span>soft drop</span></div><div className="control-row"><span><span className="key">↑</span></span><span>rotate clockwise</span></div><div className="control-row"><span><span className="key">SPACE</span></span><span>hard drop</span></div><div className="control-row"><span><span className="key">P</span><span className="key">ESC</span></span><span>pause / resume</span></div></div></article></div><div><article className="rule-block"><h2>Mobile</h2><div className="control-list"><div className="control-row"><span>Tap the board</span><span>rotate</span></div><div className="control-row"><span>Swipe left / right</span><span>move</span></div><div className="control-row"><span>Swipe down</span><span>soft drop</span></div><div className="control-row"><span>Swipe up</span><span>hard drop</span></div><div className="control-row"><span>Use the pads</span><span>fine control</span></div></div></article></div></div></Shell>;
}
function Developer() {
  return <Shell><div className="page-intro"><div className="eyebrow">05 / Developer</div><h1 className="display">MADE BY<br/><span style={{color:'var(--coral)'}}>SASWAT.</span></h1><p>One thoughtful game, built from fundamentals.</p></div><section className="profile"><div className="profile-photo-frame"><img src={developerPortrait} alt="Saswat Dixit in a suit and glasses" className="profile-photo"/></div><div className="profile-copy"><div className="eyebrow">Student Developer</div><h1 className="display">Saswat<br/>Dixit</h1><p className="profile-school">Silicon University | B.Tech CSE</p><p className="bio">Passionate about DSA, problem-solving, and software development. Currently focused on building strong programming fundamentals and real-world projects.</p><p className="profile-introduction">Computer Science student building things with code, AI/ML, and web technologies.</p><div className="profile-details"><a href="https://github.com/FireStormy1" target="_blank" rel="noreferrer" data-testid="link-github">GitHub <ExternalLink size={14}/></a><a href="https://www.linkedin.com/in/saswatdixit/" target="_blank" rel="noreferrer" data-testid="link-linkedin">LinkedIn <ExternalLink size={14}/></a><a href="mailto:saswatdixit01@gmail.com" data-testid="link-email">Email <ExternalLink size={14}/></a><a href="https://leetcode.com/u/FireStormy/" target="_blank" rel="noreferrer" data-testid="link-leetcode">LeetCode <ExternalLink size={14}/></a></div></div></section></Shell>;
}

function useGame() {
  const difficulty = (sessionStorage.getItem('tetris-difficulty') as Difficulty) || 'Normal';
  const [board,setBoard] = useState<Cell[][]>(emptyBoard);
  const [piece,setPiece] = useState<ActivePiece>(()=>newPiece('T'));
  const [next,setNext] = useState<PieceName>('I');
  const [status,setStatus] = useState<GameStatus>('READY');
  const [hasEndedGame,setHasEndedGame] = useState(false);
  const [score,setScore] = useState(0); const [lines,setLines]=useState(0); const [level,setLevel]=useState(1);
  const [highScore,setHighScore]=useState(()=>Number(localStorage.getItem('tetris-high-score')||0));
  const bagRef=useRef<PieceName[]>([]); const raf=useRef(0); const last=useRef(0); const elapsed=useRef(0);
  const drawFromBag = useCallback(() => { if(!bagRef.current.length) bagRef.current=shuffle(PIECES); return bagRef.current.shift()!; },[]);
  const reset = useCallback(() => { bagRef.current=[]; const first=drawFromBag(), upcoming=drawFromBag(); setBoard(emptyBoard()); setPiece(newPiece(first)); setNext(upcoming); setScore(0); setLines(0); setLevel(1); setStatus('PLAYING'); },[drawFromBag]);
  const lock = useCallback((active:ActivePiece) => {
    const merged=mergePiece(board,active); const result=clearLines(merged); const cleared=result.lines; const dropScore=0; const points=([0,100,300,500,800][cleared]||0)*(level)+dropScore;
    const upcoming=newPiece(next); if(collides(result.board,upcoming)) { setBoard(result.board); setScore(s=>s+points); setLines(l=>l+cleared); setHasEndedGame(true); setStatus('GAME_OVER'); return; }
    setBoard(result.board); setScore(s=>s+points); setLines(l=>l+cleared); setLevel(Math.floor((lines+cleared)/10)+1); setPiece(upcoming); setNext(drawFromBag());
  },[board,drawFromBag,level,lines,next]);
  const move = useCallback((dx:number,dy:number,hard=false) => { if(status!=='PLAYING') return; if(hard){ const d=ghostY(board,piece); setScore(s=>s+d*2); lock({...piece,y:piece.y+d}); return; } if(!collides(board,piece,dx,dy)){ setPiece(p=>({...p,x:p.x+dx,y:p.y+dy})); if(dy>0) setScore(s=>s+1); } else if(dy>0) lock(piece); },[board,lock,piece,status]);
  const rotate = useCallback(() => { if(status!=='PLAYING') return; const cells=rotateCells(piece.cells); for(const dx of [0,-1,1,-2,2]) if(!collides(board,piece,dx,0,cells)){setPiece(p=>({...p,cells,x:p.x+dx,rotation:(p.rotation+1)%4}));return;} },[board,piece,status]);
  const togglePause=useCallback(()=>setStatus(s=>s==='PLAYING'?'PAUSED':s==='PAUSED'?'PLAYING':s),[]);
  useEffect(()=>{ if(status!=='PLAYING') return; const loop=(t:number)=>{ if(!last.current)last.current=t; elapsed.current+=t-last.current; last.current=t; const speed=Math.max(90,DIFFICULTY_SPEED[difficulty]-((level-1)*45)); if(elapsed.current>=speed){elapsed.current=0; move(0,1);} raf.current=requestAnimationFrame(loop); }; raf.current=requestAnimationFrame(loop); return ()=>{cancelAnimationFrame(raf.current);last.current=0;}; },[difficulty,level,move,status]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' ','p','P','Escape'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')move(-1,0);if(e.key==='ArrowRight')move(1,0);if(e.key==='ArrowDown')move(0,1);if(e.key==='ArrowUp')rotate();if(e.key===' ')move(0,0,true);if(e.key==='p'||e.key==='P'||e.key==='Escape')togglePause();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[move,rotate,togglePause]);
  useEffect(()=>{if(score>highScore){setHighScore(score);localStorage.setItem('tetris-high-score',String(score));}},[score,highScore]);
  return { difficulty,board,piece,next,status,hasEndedGame,score,lines,level,highScore,reset,move,rotate,togglePause };
}
function MiniPiece({ type }: { type: PieceName }) { const cells=SHAPES[type]; return <div className="next-box">{Array.from({length:16},(_,i)=>{const x=i%4,y=Math.floor(i/4);const active=cells.some(([cx,cy])=>cx===x&&cy===y);return <span key={i} className={active?`filled ${type}`:''}/>})}</div>; }
function Game() {
  const game=useGame(); const touchStart=useRef<{x:number;y:number}|null>(null);
  const boardCells=useMemo(()=>{const cells=game.board.map(row=>[...row]); const gy=ghostY(game.board,game.piece); game.piece.cells.forEach(([x,y])=>{const nx=game.piece.x+x,ny=game.piece.y+y+gy;if(ny>=0&&ny<20&&!cells[ny][nx])cells[ny][nx]='ghost' as Cell;}); game.piece.cells.forEach(([x,y])=>{const nx=game.piece.x+x,ny=game.piece.y+y;if(ny>=0&&ny<20)cells[ny][nx]=game.piece.type;}); return cells;},[game.board,game.piece]);
  const shareResult=()=>{const text=`TETRIS / ${game.score} points / level ${game.level} / ${game.lines} lines / ${game.difficulty}`; if(navigator.share) navigator.share({title:'TETRIS result',text}); else downloadResult(text);};
  const downloadResult=(text?:string)=>{const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ede4d1';ctx.fillRect(0,0,900,1100);ctx.fillStyle='#24231f';ctx.font='700 92px Space Grotesk';ctx.fillText('TETRIS',70,140);ctx.font='24px IBM Plex Mono';ctx.fillText('RESULT / PRINTED SCORE CARD',72,190);ctx.strokeStyle='#b8aa91';ctx.strokeRect(70,240,760,560);ctx.fillStyle='#1d2928';ctx.fillRect(250,280,400,480);const cellW=36,cellH=24;game.board.forEach((row,y)=>row.forEach((cell,x)=>{ctx.fillStyle=cell?({I:'#6f98a7',J:'#7f9b82',L:'#d29d45',O:'#c88a64',S:'#86a274',T:'#9a8595',Z:'#c35c49'} as Record<PieceName,string>)[cell]:'#344342';ctx.fillRect(250+x*cellW,280+y*cellH,cellW-2,cellH-2);}));ctx.fillStyle='#c35c49';ctx.font='600 68px IBM Plex Mono';ctx.fillText(String(game.score).padStart(6,'0'),100,900);ctx.font='22px IBM Plex Mono';ctx.fillText(`HIGH ${String(game.highScore).padStart(6,'0')}   LEVEL ${game.level}   LINES ${game.lines}`,100,950);ctx.fillText(game.difficulty.toUpperCase(),100,1000);const a=document.createElement('a');a.download='tetris-result.png';a.href=canvas.toDataURL('image/png');a.click();};
  const startOrRestart=()=>game.reset();
  const showRestart=game.hasEndedGame&&game.status==='GAME_OVER';
  const handleTouch=(e:TouchEvent<HTMLDivElement>)=>{const start=touchStart.current;if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.max(Math.abs(dx),Math.abs(dy))<18)game.rotate();else if(Math.abs(dx)>Math.abs(dy))game.move(dx>0?1:-1,0);else game.move(0,dy>0?1:0,dy<0);touchStart.current=null;};
  return <Shell gameMode><div className="game-viewport"><div className="game-top"><div><div className="eyebrow">Game / {game.difficulty}</div><h1 className="display">STAY IN<br/><span style={{color:'var(--coral)'}}>THE FLOW.</span></h1></div><button className="button alt small" onClick={game.togglePause} data-testid="button-pause">{game.status==='PAUSED'?<PlayIcon size={14}/>:<Pause size={14}/>} {game.status==='PAUSED'?'Resume':'Pause'}</button></div><div className="game-layout"><div className="board-column"><div className="board-frame"><div className="board" onTouchStart={e=>{const t=e.touches[0];touchStart.current={x:t.clientX,y:t.clientY}}} onTouchEnd={handleTouch} data-testid="game-board">{boardCells.flatMap((row,y)=>row.map((cell,x)=><div key={`${x}-${y}`} className={`cell ${cell||''}`} data-testid={`cell-${x}-${y}`}/>))}</div>{(game.status==='PAUSED'||game.status==='READY')&&<div className="board-overlay"><div><h2>{game.status==='READY'?'READY':'PAUSED'}</h2><p>{game.status==='READY'?'Choose start below.':'Press P or tap resume.'}</p></div></div>}</div><div className="touch-controls"><button onClick={game.rotate} aria-label="Rotate" data-testid="touch-rotate"><RotateCcw/></button><button onClick={()=>game.move(-1,0)} aria-label="Move left" data-testid="touch-left"><ArrowLeft/></button><button onClick={()=>game.move(0,1)} aria-label="Soft drop" data-testid="touch-down"><ArrowDown/></button><button onClick={()=>game.move(1,0)} aria-label="Move right" data-testid="touch-right"><ArrowRight/></button><button onClick={()=>game.move(0,0,true)} aria-label="Hard drop" data-testid="touch-drop">SUDDEN DROP</button></div></div><aside className="stats-stack"><div className="stat-card next-card"><label>Next piece</label><MiniPiece type={game.next}/></div><div className="stats-primary"><div className="stat-card"><label>Score</label><strong data-testid="text-score">{String(game.score).padStart(6,'0')}</strong></div><div className="stat-card"><label>High score</label><strong data-testid="text-high-score">{String(game.highScore).padStart(6,'0')}</strong></div></div><div className="stat-card level-card"><label>Level / lines</label><strong data-testid="text-level">{game.level} / {game.lines}</strong></div><div className="game-actions">{game.status!=='PLAYING'&&game.status!=='PAUSED'&&<button className="button coral" onClick={startOrRestart} aria-label={showRestart?'Restart game':'Start game'} data-testid="button-restart">{showRestart?<RotateCcw size={14}/>:<PlayIcon size={14}/>} {showRestart?'Restart':'Start'}</button>}<button className="button alt" onClick={()=>window.history.back()} data-testid="button-game-home">Home</button></div></aside></div>{game.status==='GAME_OVER'&&game.hasEndedGame&&<ResultCard game={game} onRestart={startOrRestart} onShare={shareResult} onDownload={downloadResult}/>}</div></Shell>;
}
function ResultCard({game,onRestart,onShare,onDownload}:{game:ReturnType<typeof useGame>;onRestart:()=>void;onShare:()=>void;onDownload:()=>void}) { return <section className="result-overlay" data-testid="result-card"><div className="result-card"><div className="eyebrow">Final result / {game.difficulty}</div><h2 className="display">GAME OVER.</h2>{game.score>=game.highScore&&game.score>0&&<p className="new-record">New high score recorded</p>}<div className="result-grid"><div><small>Score</small><strong>{game.score}</strong></div><div><small>High</small><strong>{game.highScore}</strong></div><div><small>Level</small><strong>{game.level}</strong></div><div><small>Lines</small><strong>{game.lines}</strong></div></div><div className="result-actions"><button className="button coral small" onClick={onRestart} data-testid="button-restart-result"><RotateCcw size={14}/> Restart</button><button className="button alt small" onClick={onShare} data-testid="button-share-result"><Share2 size={14}/> Share result</button><button className="button alt small" onClick={onDownload} data-testid="button-download-result"><Download size={14}/> Download card</button></div></div></section>; }
function Router() { return <RoutedErrorBoundary><Switch><Route path="/" component={Home}/><Route path="/play" component={Play}/><Route path="/game" component={Game}/><Route path="/rules" component={Rules}/><Route path="/how-to-play" component={HowToPlay}/><Route path="/developer" component={Developer}/><Route component={NotFound}/></Switch></RoutedErrorBoundary>; }
function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>; }
export default App;

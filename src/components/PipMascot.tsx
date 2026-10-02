type Props = { state?:"idle"|"capturing"|"saving"|"saved"|"error"; size?:number };

export function PipMascot({state="idle",size=40}:Props){
  const tilt = state === "saved" ? "rotate(5deg)" : state === "error" ? "rotate(-4deg)" : "rotate(0deg)";
  return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Pip mascot, ${state}`} style={{transform:tilt,transition:"transform .18s ease"}}>
    <path d="M12 6 52 35 36 38 43 55 35 59 28 42 16 52Z" fill="#858CFF" stroke="#20232B" strokeWidth="2.5" strokeLinejoin="round"/>
    <circle cx="25" cy="27" r="2.7" fill="#20232B"/><circle cx="33" cy="24" r="2.7" fill="#20232B"/>
    {state==="error" ? <path d="M24 35q5-4 10 0" stroke="#20232B" strokeWidth="2" fill="none" strokeLinecap="round"/> : <path d="M24 34q5 4 10 0" stroke="#20232B" strokeWidth="2" fill="none" strokeLinecap="round"/>}
  </svg>
}
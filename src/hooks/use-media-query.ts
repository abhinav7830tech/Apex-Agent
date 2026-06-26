import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    
    // Update state with current value
    const updateMatches = () => setMatches(media.matches);
    
    // Initial check
    updateMatches();
    
    // Add listener for changes
    if (media.addEventListener) {
      media.addEventListener('change', updateMatches);
    } else {
      // Fallback for older browsers
      media.addListener(updateMatches);
    }
    
    // Cleanup
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', updateMatches);
      } else {
        media.removeListener(updateMatches);
      }
    };
  }, [query]);

  return matches;
}

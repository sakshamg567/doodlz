import axios from 'axios';
import { useState, useEffect } from 'react';
import Game from './Game';
import { getOrCreateGuestId } from './core/lib/guesId';

export default function App() {
  const [selectedOption, setSelectedOption] = useState(0);
  const [roomId, setRoomId] = useState("");
  const [userId, setUserId] = useState("");
  const options = ['Get Doodlin\'', 'Spin up your universe'];

  // Check for roomId in URL on component mount
  useEffect(() => {
    const id = getOrCreateGuestId();
    setUserId(id);
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('roomId');

    if (urlRoomId) {
      setRoomId(urlRoomId);
    }
  }, []);

  const handleCreateRoom = async () => {
    try {
      const res = await axios.post('http://localhost:3000/room/create', {
        hostId: userId
      });
      const newRoomId = res.data.roomId;
      setRoomId(newRoomId);
      console.log(newRoomId);
    } catch (error) {
      console.log("failed fetching id : ", error);
    }
  }

  const handleJoinRoom = async () => {
    const roomIdInput = prompt("Enter Room ID:");
    if (roomIdInput) {
      setRoomId(roomIdInput);

      // Update URL
      const newUrl = `${window.location.pathname}?roomId=${roomIdInput}`;
      window.history.pushState({ roomId: roomIdInput }, '', newUrl);
    }
  }

  const handler = () => {
    if (selectedOption === 0) handleJoinRoom();
    else if (selectedOption === 1) handleCreateRoom();
  }

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoomId = urlParams.get('roomId');
      setRoomId(urlRoomId || "");
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        setSelectedOption(prev => prev === 0 ? options.length - 1 : prev - 1);
      } else if (e.key === 'ArrowDown') {
        setSelectedOption(prev => prev === options.length - 1 ? 0 : prev + 1);
      } else if (e.key === 'Enter') {
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handler, options.length]);

  return (
    <>
      {roomId !== "" && <Game roomId={roomId} />}

      {roomId === "" && (
        <div className="relative h-screen min-h-screen bg-[url('/bg.webp')] bg-no-repeat bg-center bg-cover flex flex-col items-center justify-center">
          {/* Doodle PNG Overlay */}
          <div className="absolute opacity-25 inset-0 bg-[url('/doodlez.webp')] bg-no-repeat bg-center bg-cover pointer-events-none z-10" />

          {/* Content */}
          <h1 className="selection:bg-red-500 selection:text-white font-doodle font-bold text-7xl sm:text-7xl md:text-8xl lg:text-9xl -mt-10 mb-20">Doodlz</h1>

          <div className="flex flex-col items-center justify-center mt-8">
            <div className="flex flex-col items-center justify-center mt-8 space-y-2">
              {options.map((option, index) => (
                <div
                  key={index}
                  className={`flex flex-row items-center cursor-pointer transition-all duration-200 ${selectedOption === index ? 'scale-105' : 'scale-100'
                    }`}
                  onMouseEnter={() => setSelectedOption(index)}
                  onClick={handler}
                >
                  <img
                    className={`w-8 h-8 mr-4 transition-opacity duration-200 ${selectedOption === index ? 'opacity-100' : 'opacity-0'
                      }`}
                    src="/selector.webp"
                    alt=""
                  />
                  <h1 className={`font-doodle text-4xl transition-colors duration-200`}>
                    {option}
                  </h1>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const PostContext = createContext({
  posts: [],
  addPost: () => {},
  deletePost: () => {},
  likePost: () => {},
  upvotePost: () => {},
  downvotePost: () => {},
  searchPosts: () => [],
});

const examplePosts = [
  {
    id: 'post-1',
    authorId: 'user-1',
    authorName: 'FitLife Pro',
    routine: {
      id: 'boxing-1',
      name: 'Boxing Workout',
      rounds: 5,
      workSec: 180,
      restSec: 60,
      description: 'High intensity boxing routine',
      workoutPlaylistId: 'spotify-playlist-boxing',
      spotifyPlaylist: 'Workout Hits 2024',
    },
    type: 'new',
    category: 'sport',
    caption: 'Perfect for building endurance! This boxing routine helped me get in shape. Try it out!',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 15,
    downvotes: 2,
    userVote: 0,
  },
  {
    id: 'post-2',
    authorId: 'user-2',
    authorName: 'Language Learner',
    routine: {
      id: 'italian-1',
      name: 'Learn Italian',
      rounds: 10,
      workSec: 300,
      restSec: 60,
      description: 'Daily Italian practice routine',
    },
    type: 'new',
    category: 'learn',
    caption: 'Practice Italian every day with this routine. Great for building vocabulary!',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 28,
    downvotes: 1,
    userVote: 0,
  },
  {
    id: 'post-3',
    authorId: 'user-3',
    authorName: 'Study Master',
    routine: {
      id: 'study-1',
      name: 'Study Session',
      rounds: 4,
      workSec: 1800,
      restSec: 300,
      description: 'Pomodoro technique study routine',
      workoutPlaylistId: 'spotify-playlist-focus',
      spotifyPlaylist: 'Focus & Study',
    },
    type: 'completed',
    category: 'study',
    caption: 'Just completed this! Super effective for staying focused while studying.',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 42,
    downvotes: 3,
    userVote: 0,
  },
  {
    id: 'post-4',
    authorId: 'user-4',
    authorName: 'Boxing Coach',
    routine: {
      id: 'boxing-2',
      name: 'Train Boxing',
      rounds: 8,
      workSec: 150,
      restSec: 45,
      description: 'Intermediate boxing training',
    },
    type: 'new',
    category: 'sport',
    caption: 'Train like a pro with this boxing routine. Build endurance and technique!',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 11,
    downvotes: 1,
    userVote: 0,
  },
  {
    id: 'post-5',
    authorId: 'user-5',
    authorName: 'Mindful Moments',
    routine: {
      id: 'mindfulness-1',
      name: 'Mindful Morning',
      rounds: 4,
      workSec: 600,
      restSec: 60,
      description: 'Morning mindfulness meditation routine',
    },
    type: 'completed',
    category: 'mindfulness',
    caption: 'Start your day calm and focused. This routine changed my mornings!',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 34,
    downvotes: 0,
    userVote: 0,
  },
  {
    id: 'post-6',
    authorId: 'user-6',
    authorName: 'Study Squad',
    routine: {
      id: 'study-2',
      name: 'Deep Work Session',
      rounds: 3,
      workSec: 2400,
      restSec: 600,
      description: 'Deep work study blocks',
    },
    type: 'new',
    category: 'study',
    caption: 'Need to get serious work done? Try this deep work routine!',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    likes: 0,
    liked: false,
    upvotes: 27,
    downvotes: 4,
    userVote: 0,
  },
];

export const PostProvider = ({ children }) => {
  const [posts, setPosts] = useState(examplePosts);

  const addPost = useCallback((post) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const deletePost = useCallback((postId) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const likePost = useCallback((postId) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? (post.likes || 1) - 1 : (post.likes || 0) + 1,
            }
          : post,
      ),
    );
  }, []);

  const upvotePost = useCallback((postId) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;

        const currentVote = post.userVote || 0;
        let newVote = 1;
        let upvotes = post.upvotes || 0;
        let downvotes = post.downvotes || 0;

        if (currentVote === 1) {
          newVote = 0;
          upvotes = Math.max(0, upvotes - 1);
        } else {
          if (currentVote === -1) {
            downvotes = Math.max(0, downvotes - 1);
          }
          upvotes += 1;
        }

        return {
          ...post,
          userVote: newVote,
          upvotes,
          downvotes,
        };
      }),
    );
  }, []);

  const downvotePost = useCallback((postId) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;

        const currentVote = post.userVote || 0;
        let newVote = -1;
        let upvotes = post.upvotes || 0;
        let downvotes = post.downvotes || 0;

        if (currentVote === -1) {
          newVote = 0;
          downvotes = Math.max(0, downvotes - 1);
        } else {
          if (currentVote === 1) {
            upvotes = Math.max(0, upvotes - 1);
          }
          downvotes += 1;
        }

        return {
          ...post,
          userVote: newVote,
          upvotes,
          downvotes,
        };
      }),
    );
  }, []);

  const searchPosts = useCallback(
    (query) => {
      const searchTerm = query.toLowerCase().trim();
      if (!searchTerm) return posts;

      return posts.filter((post) => {
        const routineName = post.routine.name?.toLowerCase() || '';
        const caption = post.caption?.toLowerCase() || '';
        const authorName = post.authorName?.toLowerCase() || '';
        const category = post.category?.toLowerCase() || '';
        const routineDesc = post.routine.description?.toLowerCase() || '';

        return (
          routineName.includes(searchTerm) ||
          caption.includes(searchTerm) ||
          authorName.includes(searchTerm) ||
          category.includes(searchTerm) ||
          routineDesc.includes(searchTerm)
        );
      });
    },
    [posts],
  );

  const value = useMemo(
    () => ({
      posts,
      addPost,
      deletePost,
      likePost,
      upvotePost,
      downvotePost,
      searchPosts,
    }),
    [posts, addPost, deletePost, likePost, upvotePost, downvotePost, searchPosts],
  );

  return <PostContext.Provider value={value}>{children}</PostContext.Provider>;
};

export const usePostContext = () => useContext(PostContext);





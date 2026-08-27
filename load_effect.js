  useEffect(() => {
    loadRecentConversations().then((conversations) => {
      if (conversations && conversations.length > 0) {
        // Just load the most recent conversation's messages for context
        setChatHistory(conversations[0].messages || []);
      }
    });
  }, []);

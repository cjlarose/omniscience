const initialState = {
  pendingMessages: [],
};

function handleOffsets(state = initialState, action) {
  switch (action.type) {
    case 'OffsetUpdated': {
      const { topic, partition, offset } = action;
      const oldTopicState = state[topic] || {};
      const newTopicState = Object.assign({}, oldTopicState, { [partition]: offset });
      return Object.assign({}, state, { [topic]: newTopicState });
    }
    case 'MessagesPublished': {
      return Object.assign({}, state, { pendingMessages: [] });
    }
    default:
      return state;
  }
}

module.exports = {
  handleOffsets,
};

const initialState = {
  repos: {},
  pendingEvents: [],
};

const initialRepoState = {
  numPushEvents: 0,
  mergedPrs: {},
  closedPrs: [],
};

function updateRepo(state, repo, f) {
  const oldRepoState = state.repos[repo] ? state.repos[repo] : initialRepoState;
  const newRepoState = f(oldRepoState);
  const newRepos = Object.assign({}, state.repos, { [repo]: newRepoState });
  return Object.assign({}, state, { repos: newRepos });
}

function annotatePushEvent(state = initialState, action) {
  switch (action.type) {
    case 'PushEvent': {
      const repo = action.event.repo.id;
      return updateRepo(state, repo, oldRepoState =>
        Object.assign({}, oldRepoState, { numPushEvents: oldRepoState.numPushEvents + 1 })
      );
    }
    case 'PullRequestEvent': {
      const repo = action.event.repo.id;
      const payload = action.event.payload;
      if (payload.action !== 'closed') {
        return state;
      }
      return updateRepo(state, repo, (oldRepoState) => {
        if (payload.pull_request.merged) {
          return Object.assign({}, oldRepoState, {
            mergedPrs: Object.assign({}, oldRepoState.mergedPrs, {
              [payload.pull_request.merge_commit_sha]: payload.pull_request.number,
            }),
          });
        }
        return Object.assign({}, oldRepoState, {
          closedPrs: [...oldRepoState.closedPrs, payload.pull_request.number],
        });
      });
    }
    default:
      return state;
  }
}

module.exports = {
  annotatePushEvent,
};

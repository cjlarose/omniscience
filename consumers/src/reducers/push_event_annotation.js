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

function pushEventOnWatchedRef(event) {
  // TODO: Allow git-flow config here
  return event.payload.ref === 'refs/heads/develop' ||
    event.payload.ref.startsWith('refs/heads/release/');
}

function annotatePushEvent(state = initialState, action) {
  switch (action.type) {
    case 'PushEvent': {
      const { id: repoId, name: repoName } = action.event.repo;
      const payload = action.event.payload;

      if (!pushEventOnWatchedRef(action.event)) {
        return state;
      }
      return updateRepo(state, repoId, (oldRepoState) => {
        if (oldRepoState.mergedPrs[payload.head]) {
          console.log(`${repoName}: Push event for PR #${oldRepoState.mergedPrs[payload.head]} observed!`);
        } else {
          console.error(`${repoName}: Commit ${payload.head} onto ${payload.ref} does not appear to be from a PR`);
          console.log('Known PRs');
          console.log(JSON.stringify(oldRepoState.mergedPrs, null, 2));
        }

        return Object.assign({}, oldRepoState, { numPushEvents: oldRepoState.numPushEvents + 1 });
      });
    }
    case 'PullRequestEvent': {
      const { id: repoId, name: repoName } = action.event.repo;
      const payload = action.event.payload;
      if (payload.action !== 'closed') {
        return state;
      }
      return updateRepo(state, repoId, (oldRepoState) => {
        if (payload.pull_request.merged) {
          console.log(`${repoName}: PR #${payload.pull_request.number} merged!`);
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

(ns topology.core
  (:require topology.github-event-timestamp-extractor
            [clojure.data.json :as json])
  (:import [org.apache.kafka.streams.kstream KStreamBuilder Predicate Reducer ValueJoiner]
           [org.apache.kafka.streams KafkaStreams StreamsConfig]
           [org.apache.kafka.common.serialization Serdes]
           [topology.github-event-timestamp-extractor GithubEventTimestampExtractor])
  (:gen-class))

(def props
  {StreamsConfig/APPLICATION_ID_CONFIG,    "omniscience"
   StreamsConfig/BOOTSTRAP_SERVERS_CONFIG, "kafka:9092"
   StreamsConfig/KEY_SERDE_CLASS_CONFIG,   (.getName (.getClass (Serdes/Long)))
   StreamsConfig/VALUE_SERDE_CLASS_CONFIG, (.getName (.getClass (Serdes/String)))
   StreamsConfig/TIMESTAMP_EXTRACTOR_CLASS_CONFIG (.getName GithubEventTimestampExtractor)})

(def git-flow-config
  {:master-branch "master"
   :develop-branch "develop"
   :release-prefix "release/"})

(def input-topic
  (into-array String ["githubEvents"]))

(defn merged-pr-event? [ev]
  (and (= (ev "type") "PullRequestEvent")
       (= (get-in ev ["payload" "action"]) "closed")
       (get-in ev ["payload" "pull_request" "merged"])))

(defn merged-into-develop-pr-event? [ev]
  (and (merged-pr-event? ev)
       (= (get-in ev ["payload" "pull_request" "base" "ref"]
          (:develop-branch git-flow-config)))))

(defn push-event? [ev]
  (= (ev "type") "PushEvent"))

(defn push-event-on-develop? [ev]
  (and (push-event? ev)
       (= (get-in ev ["payload" "ref"])
          (str "refs/heads/" (:develop-branch git-flow-config)))))

(defn eventFilter [p]
  (reify Predicate
    (test [_ _ v]
      (let [parsed (json/read-str v)]
        ((comp boolean p) parsed)))))

(def last-merged-pr-reducer
  (reify Reducer
    (apply [_ v1 v2]
      v2)))

(def push-event-annotator
  ;; TODO: consider what happens when last-merged-pr is nil
  (reify ValueJoiner
    (apply [_ push-event-json last-merged-pr-json]
      (let [push-event (json/read-str push-event-json)
            last-merged-pr (json/read-str last-merged-pr-json)
            push-event-head-sha (get-in push-event ["payload" "head"])
            pr-merge-commit-sha (get-in last-merged-pr ["payload" "pull_request" "merge_commit_sha"])
            match? (= push-event-head-sha pr-merge-commit-sha)
            repo-name (get-in push-event ["repo" "name"])]
      (if match?
        (str repo-name ": PR #" (get-in last-merged-pr ["payload" "pull_request" "number"]) " merged!")
        (str repo-name ": Rogue push commit " push-event-head-sha))))))

(defn -main [& args]
  (let [builder (KStreamBuilder.)
        config  (StreamsConfig. props)
        github-events (.stream builder input-topic)
        last-merged-pr-table (-> github-events
                                 (.filter (eventFilter merged-into-develop-pr-event?))
                                 (.groupByKey)
                                 (.reduce last-merged-pr-reducer "last-merged-pr"))
        push-events-on-develop (-> github-events
                                   (.filter (eventFilter push-event-on-develop?)))
        push-event-annotations (.leftJoin push-events-on-develop last-merged-pr-table push-event-annotator)]
    (-> push-event-annotations
        (.to "pushEventAnnotations"))

    (let [streams (KafkaStreams. builder config)
          shutdown-hook (reify Runnable
                          (run [_]
                            (println "Shutting down NAOW")
                            (.close streams)))]
      (.addShutdownHook (Runtime/getRuntime) (Thread. shutdown-hook))
      (.start streams))))

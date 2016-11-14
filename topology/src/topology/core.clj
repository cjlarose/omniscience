(ns topology.core
  (:require topology.github-event-timestamp-extractor
            [clojure.data.json :as json]
            [clojure.string :refer [starts-with?]])
  (:import [org.apache.kafka.streams.kstream KStreamBuilder Predicate Reducer]
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

(def input-topic
  (into-array String ["githubEvents"]))

(defn merged-pr-event? [ev]
  (and (= (ev "type") "PullRequestEvent")
       (= (get-in ev ["payload" "action"]) "closed")
       (get-in ev ["payload" "pull_request" "merged"])))

(defn push-event? [ev]
  (= (ev "type") "PushEvent"))

(defn push-event-on-watched-ref? [ev]
  ;; TODO Allow git-flow config here
  (and (push-event? ev)
       (let [ref (get-in ev ["payload" "ref"])]
         (or (= ref "refs/heads/develop")
             (starts-with? ref "refs/heads/release/")))))

(defn eventFilter [p]
  (reify Predicate
    (test [_ _ v]
      (let [parsed (json/read-str v)]
        ((comp boolean p) parsed)))))

(def last-merged-pr-reducer
  (reify Reducer
    (apply [_ v1 v2]
      v2)))

(defn -main [& args]
  (prn "starting")
  (prn (.getName GithubEventTimestampExtractor))
  (prn props)
  (let [builder (KStreamBuilder.)
        config  (StreamsConfig. props)]
    (->
      (.stream builder input-topic)
      ;; (.mapValues (reify ValueMapper (apply [_ v] (-> v (json/read-str) (get-in ["event" "type"])))))
      ;; (.filter eventFilter)
      (.filter (eventFilter merged-pr-event?))
      (.groupByKey)
      (.reduce last-merged-pr-reducer "last-merged-pr")
      (.to "my-output-topic"))

    (let [streams (KafkaStreams. builder config)
          shutdown-hook (reify Runnable
                          (run [_]
                            (println "Shutting down NAOW")
                            (.close streams)))]
      (.addShutdownHook (Runtime/getRuntime) (Thread. shutdown-hook))
      (.start streams))))

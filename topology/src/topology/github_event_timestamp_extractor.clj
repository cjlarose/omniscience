(ns topology.github-event-timestamp-extractor
  (:require [clojure.data.json :as json]
            [clj-time.coerce :as coerce])
  (:gen-class
    :name topology.github-event-timestamp-extractor.GithubEventTimestampExtractor
    :implements [org.apache.kafka.streams.processor.TimestampExtractor]
    :methods [[extract [org.apache.kafka.clients.consumer.ConsumerRecord long] long]]))

(defn -extract [_ record]
  (let [message-value (json/read-str (.value record))]
    (-> message-value
        (get-in ["event" "created_at"])
        (coerce/to-long))))

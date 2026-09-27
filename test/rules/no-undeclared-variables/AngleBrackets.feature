Feature: Angle brackets that are not placeholders

  Scenario Outline: Comparing <a>
    When I compare x < 5 and y > 3
    Then the page shows
      """
      <div class="x"><first name></div>
      <br/> and <b>
      """

    Examples:
      | a | first name |
      | 1 | Ann        |
